import axios from "axios";
import crypto from "crypto";
import { env } from "../../config/env";
import type { BrokerHolding, BrokerMfHolding, BrokerOrder, BrokerProvider } from "./types";

/**
 * Broker integration layer.
 *
 *   App → BrokerProvider → broker REST API → exchange
 *
 * Two hard rules encoded here:
 *  1. We never accept, transmit or store a broker password/PIN. Only OAuth-style
 *     request-token flows are supported.
 *  2. Tokens are encrypted before they touch the database (see lib/crypto.ts).
 *
 * A broker whose API keys are not configured reports `configured: false`, and
 * the API surfaces that instead of pretending a connection is possible.
 */

export class ZerodhaKiteProvider implements BrokerProvider {
  readonly id = "ZERODHA";
  readonly label = "Zerodha Kite";
  private apiKey = process.env.ZERODHA_API_KEY ?? "";
  private apiSecret = process.env.ZERODHA_API_SECRET ?? "";

  get configured() {
    return Boolean(this.apiKey && this.apiSecret);
  }

  getAuthUrl(state: string): string {
    // Kite Connect login. The user authenticates on Zerodha's own domain and we
    // only ever receive a short-lived request token.
    return `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(this.apiKey)}&state=${encodeURIComponent(state)}`;
  }

  async exchangeCode(requestToken: string) {
    // Demo/dev shortcut only — in production this string is treated like any
    // other (invalid) request token and rejected by Zerodha's real API below,
    // so it can't be used to fabricate a "connected" broker in a live deploy.
    if (requestToken === "mock_code_123" && !env.isProd) {
      const expiresAt = new Date();
      expiresAt.setHours(23, 59, 59, 0);
      return {
        accessToken: "mock_access_token_123",
        externalUserId: "MOCK_ZERODHA_USER",
        expiresAt,
      };
    }

    const checksum = crypto
      .createHash("sha256")
      .update(this.apiKey + requestToken + this.apiSecret)
      .digest("hex");
    const body = new URLSearchParams({ api_key: this.apiKey, request_token: requestToken, checksum });
    const res = await axios.post("https://api.kite.trade/session/token", body.toString(), {
      headers: { "X-Kite-Version": "3", "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 12000,
    });
    const data = res.data?.data ?? {};
    const expiresAt = new Date();
    expiresAt.setHours(23, 59, 59, 0); // Kite access tokens expire daily.
    return {
      accessToken: String(data.access_token ?? ""),
      externalUserId: data.user_id ? String(data.user_id) : undefined,
      expiresAt,
    };
  }

  private headers(accessToken: string) {
    return { "X-Kite-Version": "3", Authorization: `token ${this.apiKey}:${accessToken}` };
  }

  async getHoldings(accessToken: string): Promise<BrokerHolding[]> {
    if (accessToken === "mock_access_token_123" && !env.isProd) {
      return [
        { symbol: "BEL.NS", quantity: 24, avgPrice: 450.54, exchange: "NSE" },
        { symbol: "ONGC.NS", quantity: 31, avgPrice: 274.22, exchange: "NSE" },
        { symbol: "COALINDIA.NS", quantity: 5, avgPrice: 460.74, exchange: "NSE" },
        { symbol: "INFY.NS", quantity: 1, avgPrice: 1298.30, exchange: "NSE" },
        { symbol: "IRFC.NS", quantity: 2, avgPrice: 100.75, exchange: "NSE" },
        { symbol: "RELIANCE.NS", quantity: 2, avgPrice: 1336.35, exchange: "NSE" },
        { symbol: "TATAPOWER.NS", quantity: 4, avgPrice: 395.85, exchange: "NSE" },
        { symbol: "ADANIGREEN.NS", quantity: 3, avgPrice: 1020.20, exchange: "NSE" },
        { symbol: "MON100.NS", quantity: 6, avgPrice: 247.28, exchange: "NSE" },
        { symbol: "MASPTOP50.NS", quantity: 6, avgPrice: 75.00, exchange: "NSE" },
        { symbol: "TATAGOLD.NS", quantity: 102, avgPrice: 14.61, exchange: "NSE" },
      ];
    }

    const res = await axios.get("https://api.kite.trade/portfolio/holdings", {
      headers: this.headers(accessToken),
      timeout: 12000,
    });
    const rows: Array<Record<string, unknown>> = res.data?.data ?? [];
    return rows.map((r) => ({
      symbol: String(r.tradingsymbol ?? ""),
      // Kite splits a holding into `quantity` (settled, in demat) and
      // `t1_quantity` (bought within the last day, still in T+1 settlement —
      // not yet in demat, but genuinely owned). Reading only `quantity`
      // under-counted anything bought very recently.
      quantity: Number(r.quantity ?? 0) + Number(r.t1_quantity ?? 0),
      avgPrice: Number(r.average_price ?? 0),
      exchange: String(r.exchange ?? "NSE"),
    }));
  }

  async getMfHoldings(accessToken: string): Promise<BrokerMfHolding[]> {
    if (accessToken === "mock_access_token_123" && !env.isProd) {
      return [
        {
          schemeCode: "122639",
          schemeName: "Parag Parikh Flexi Cap Fund - Direct Plan - Growth",
          folio: "10192834/56",
          units: 145.25,
          avgPrice: 62.40,
        },
        {
          schemeCode: "118834",
          schemeName: "Mirae Asset Large Cap Fund - Direct Plan - Growth",
          folio: "20938475/12",
          units: 210.50,
          avgPrice: 94.80,
        },
        {
          schemeCode: "120503",
          schemeName: "Nippon India Small Cap Fund - Direct Plan - Growth",
          folio: "31827465/99",
          units: 180.00,
          avgPrice: 125.10,
        },
      ];
    }

    try {
      const res = await axios.get("https://api.kite.trade/mf/holdings", {
        headers: this.headers(accessToken),
        timeout: 12000,
      });
      const rows: Array<Record<string, unknown>> = res.data?.data ?? [];
      return rows.map((r) => ({
        folio: r.folio ? String(r.folio) : undefined,
        schemeCode: r.tradingsymbol ? String(r.tradingsymbol) : undefined,
        schemeName: String(r.fund ?? r.tradingsymbol ?? "Mutual Fund"),
        units: Number(r.quantity ?? 0),
        avgPrice: Number(r.average_price ?? 0),
        lastPrice: r.last_price != null ? Number(r.last_price) : undefined,
        pnl: r.pnl != null ? Number(r.pnl) : undefined,
      }));
    } catch (err) {
      console.warn("[Zerodha] Failed to fetch MF holdings from Kite:", err);
      return [];
    }
  }

  async getOrders(accessToken: string): Promise<BrokerOrder[]> {
    if (accessToken === "mock_access_token_123" && !env.isProd) {
      return [
        { id: "z1", symbol: "TCS.NS", side: "BUY", quantity: 60, price: 3420, status: "COMPLETE", placedAt: new Date().toISOString() },
        { id: "z2", symbol: "INFY.NS", side: "BUY", quantity: 120, price: 1450, status: "COMPLETE", placedAt: new Date().toISOString() },
      ];
    }

    const res = await axios.get("https://api.kite.trade/orders", {
      headers: this.headers(accessToken),
      timeout: 12000,
    });
    const rows: Array<Record<string, unknown>> = res.data?.data ?? [];
    return rows.map((r) => ({
      id: String(r.order_id ?? ""),
      symbol: String(r.tradingsymbol ?? ""),
      side: String(r.transaction_type ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
      quantity: Number(r.quantity ?? 0),
      price: r.average_price != null ? Number(r.average_price) : null,
      status: String(r.status ?? ""),
      placedAt: String(r.order_timestamp ?? ""),
    }));
  }

  async getPositions(accessToken: string): Promise<any[]> {
    if (accessToken === "mock_access_token_123" && !env.isProd) {
      return [
        {
          symbol: "TCS.NS",
          quantity: 10,
          avgPrice: 3120.5,
          lastPrice: 3215.2,
          pnl: 947,
          productType: "CNC",
          exchange: "NSE",
        },
        {
          symbol: "INFY.NS",
          quantity: 20,
          avgPrice: 1390.0,
          lastPrice: 1410.5,
          pnl: 410,
          productType: "CNC",
          exchange: "NSE",
        }
      ];
    }

    const res = await axios.get("https://api.kite.trade/portfolio/positions", {
      headers: this.headers(accessToken),
      timeout: 12000,
    });
    const netPositions: Array<Record<string, any>> = res.data?.data?.net ?? [];
    return netPositions.map((p) => ({
      symbol: String(p.tradingsymbol ?? ""),
      quantity: Number(p.quantity ?? 0),
      avgPrice: Number(p.average_price ?? 0),
      lastPrice: Number(p.last_price ?? 0),
      pnl: Number(p.pnl ?? 0),
      productType: String(p.product ?? ""),
      exchange: String(p.exchange ?? ""),
    }));
  }
}

export class UpstoxProvider implements BrokerProvider {
  readonly id = "UPSTOX";
  readonly label = "Upstox";
  private apiKey = env.upstoxApiKey;
  private apiSecret = env.upstoxApiSecret;
  private redirectUri = env.upstoxRedirectUri;

  get configured() {
    return Boolean(this.apiKey && this.apiSecret);
  }

  private getRedirectUri(): string {
    return this.redirectUri || `${env.brokerRedirectBase}/UPSTOX`;
  }

  getAuthUrl(state: string): string {
    const redirect = this.getRedirectUri();
    return `https://api.upstox.com/v2/login/authorization/dialog?client_id=${encodeURIComponent(this.apiKey)}&redirect_uri=${encodeURIComponent(redirect)}&state=${encodeURIComponent(state)}&response_type=code`;
  }

  async exchangeCode(code: string) {
    const redirect = this.getRedirectUri();
    const body = new URLSearchParams({
      code,
      client_id: this.apiKey,
      client_secret: this.apiSecret,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    });
    const res = await axios.post("https://api.upstox.com/v2/login/authorization/token", body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      timeout: 12000,
    });
    const expiresAt = new Date();
    expiresAt.setHours(23, 59, 59, 0);
    return {
      accessToken: String(res.data?.access_token ?? ""),
      externalUserId: res.data?.user_id ? String(res.data.user_id) : undefined,
      expiresAt,
    };
  }

  async getHoldings(accessToken: string): Promise<BrokerHolding[]> {
    const res = await axios.get("https://api.upstox.com/v2/portfolio/long-term-holdings", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      timeout: 12000,
    });
    const rows: Array<Record<string, unknown>> = res.data?.data ?? [];
    return rows.map((r) => ({
      symbol: String(r.tradingsymbol ?? ""),
      // Same T+1 settlement split as Kite: a share bought very recently
      // shows up in `t1_quantity`, not yet in the settled `quantity`.
      quantity: Number(r.quantity ?? 0) + Number(r.t1_quantity ?? 0),
      avgPrice: Number(r.average_price ?? 0),
      exchange: String(r.exchange ?? "NSE"),
    }));
  }

  async getMfHoldings(_accessToken: string): Promise<BrokerMfHolding[]> {
    return [];
  }

  async getOrders(accessToken: string): Promise<BrokerOrder[]> {
    const res = await axios.get("https://api.upstox.com/v2/order/retrieve-all", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      timeout: 12000,
    });
    const rows: Array<Record<string, unknown>> = res.data?.data ?? [];
    return rows.map((r) => ({
      id: String(r.order_id ?? ""),
      symbol: String(r.tradingsymbol ?? ""),
      side: String(r.transaction_type ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
      quantity: Number(r.quantity ?? 0),
      price: r.average_price != null ? Number(r.average_price) : null,
      status: String(r.status ?? ""),
      placedAt: String(r.order_timestamp ?? ""),
    }));
  }
}

const REGISTRY: BrokerProvider[] = [new ZerodhaKiteProvider(), new UpstoxProvider()];

export function listBrokers() {
  return REGISTRY.map((b) => ({ id: b.id, label: b.label, configured: b.configured }));
}

export function getBroker(id: string): BrokerProvider | undefined {
  return REGISTRY.find((b) => b.id === id.toUpperCase());
}
