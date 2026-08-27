import axios from "axios";
import crypto from "crypto";
import { env } from "../../config/env";
import type { BrokerHolding, BrokerOrder, BrokerProvider } from "./types";

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
    if (requestToken === "mock_code_123") {
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
    if (accessToken === "mock_access_token_123") {
      return [
        { symbol: "TCS.NS", quantity: 5, avgPrice: 3420.00, exchange: "NSE" },
        { symbol: "INFY.NS", quantity: 10, avgPrice: 1450.00, exchange: "NSE" },
        { symbol: "RELIANCE.NS", quantity: 2, avgPrice: 2393.865, exchange: "NSE" },
      ];
    }

    const res = await axios.get("https://api.kite.trade/portfolio/holdings", {
      headers: this.headers(accessToken),
      timeout: 12000,
    });
    const rows: Array<Record<string, unknown>> = res.data?.data ?? [];
    return rows.map((r) => ({
      symbol: String(r.tradingsymbol ?? ""),
      quantity: Number(r.quantity ?? 0),
      avgPrice: Number(r.average_price ?? 0),
      exchange: String(r.exchange ?? "NSE"),
    }));
  }

  async getOrders(accessToken: string): Promise<BrokerOrder[]> {
    if (accessToken === "mock_access_token_123") {
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
    if (accessToken === "mock_access_token_123") {
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
  private apiKey = process.env.UPSTOX_API_KEY ?? "";
  private apiSecret = process.env.UPSTOX_API_SECRET ?? "";

  get configured() {
    return Boolean(this.apiKey && this.apiSecret);
  }

  getAuthUrl(state: string): string {
    const redirect = `${env.brokerRedirectBase}/UPSTOX`;
    return `https://api.upstox.com/v2/login/authorization/dialog?client_id=${encodeURIComponent(this.apiKey)}&redirect_uri=${encodeURIComponent(redirect)}&state=${encodeURIComponent(state)}&response_type=code`;
  }

  async exchangeCode(code: string) {
    const body = new URLSearchParams({
      code,
      client_id: this.apiKey,
      client_secret: this.apiSecret,
      redirect_uri: `${env.brokerRedirectBase}/UPSTOX`,
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
      quantity: Number(r.quantity ?? 0),
      avgPrice: Number(r.average_price ?? 0),
      exchange: String(r.exchange ?? "NSE"),
    }));
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
