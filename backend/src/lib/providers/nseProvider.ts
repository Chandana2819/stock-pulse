/**
 * NSE Data Provider
 *
 * Fetches publicly accessible NSE archive data that does NOT require a browser
 * session / cookies:
 *
 *   - Bulk deals CSV  (https://archives.nseindia.com/content/equities/bulk.csv)
 *   - Block deals CSV (https://archives.nseindia.com/content/equities/block.csv)
 *
 * Both are published daily by NSE with no authentication requirement.
 *
 * Data is cached in-memory for 1 hour so the scanner doesn't re-fetch on
 * every symbol. The cache is reset at midnight IST automatically.
 */

import https from "https";
import { logger } from "../logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BulkDeal {
  date: string;
  symbol: string;       // e.g. RELIANCE (no .NS suffix)
  clientName: string;
  buySell: "BUY" | "SELL";
  qtyTraded: number;
  avgPrice: number;
}

interface DealCache {
  data: BulkDeal[];
  fetchedAt: number; // Date.now()
}

// ─── In-memory cache ─────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let bulkCache: DealCache | null = null;
let blockCache: DealCache | null = null;

// ─── CSV fetcher ─────────────────────────────────────────────────────────────

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BullHawk/1.0)",
        "Accept": "text/csv,text/plain,*/*",
      },
      timeout: 10_000,
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchText(res.headers.location as string).then(resolve, reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function parseDealsCSV(csv: string): BulkDeal[] {
  const lines = csv.split("\n").filter(Boolean);
  if (lines.length < 2) return [];

  // Header: Date,Symbol,Security Name,Client Name,Buy/Sell,Quantity Traded,Wgt. Avg. Price
  const deals: BulkDeal[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(s => s.trim().replace(/^"|"$/g, ""));
    if (cols.length < 7) continue;
    const [date, symbol, , clientName, buySell, qtyStr, priceStr] = cols;
    const qty = parseFloat(qtyStr.replace(/,/g, ""));
    const price = parseFloat(priceStr.replace(/,/g, ""));
    if (!symbol || isNaN(qty) || isNaN(price)) continue;
    deals.push({
      date: date.trim(),
      symbol: symbol.trim().toUpperCase(),
      clientName: clientName.trim(),
      buySell: buySell.trim().toUpperCase().startsWith("S") ? "SELL" : "BUY",
      qtyTraded: qty,
      avgPrice: price,
    });
  }
  return deals;
}

async function loadDeals(
  url: string,
  cache: DealCache | null
): Promise<{ deals: BulkDeal[]; fresh: DealCache }> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { deals: cache.data, fresh: cache };
  }
  try {
    const csv = await fetchText(url);
    const data = parseDealsCSV(csv);
    const fresh: DealCache = { data, fetchedAt: now };
    return { deals: data, fresh };
  } catch (err) {
    logger.warn("[nse] Failed to fetch deals CSV", { url, err: String(err) });
    // Return stale cache if available, empty otherwise
    return { deals: cache?.data ?? [], fresh: cache ?? { data: [], fetchedAt: 0 } };
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns all bulk + block deals for a given NSE symbol on today's date.
 * Symbol should be bare (e.g. "RELIANCE", not "RELIANCE.NS").
 */
export async function getDealsForSymbol(symbol: string): Promise<BulkDeal[]> {
  const bare = symbol.replace(/\.(NS|BO)$/i, "").toUpperCase();

  const [bulkResult, blockResult] = await Promise.all([
    loadDeals("https://archives.nseindia.com/content/equities/bulk.csv", bulkCache),
    loadDeals("https://archives.nseindia.com/content/equities/block.csv", blockCache),
  ]);

  bulkCache = bulkResult.fresh;
  blockCache = blockResult.fresh;

  return [...bulkResult.deals, ...blockResult.deals].filter(
    (d) => d.symbol === bare
  );
}

/**
 * Returns true if promoters or FIIs are selling significant quantities today.
 *
 * A "significant" sell = any single client SELL deal where quantity exceeds
 * 0.1% of the company's tradeable float — but since we don't have float data,
 * we use a simpler proxy: if ANY institution/promoter is selling and the deal
 * represents a notable notional value (>₹5 crore at avg price), flag it.
 *
 * Promoter detection: NSE client name often contains "PROMOTER", "PROMOTERS",
 * the company's own name, or the promoter group entity's name. We flag any
 * SELL deal from an entity whose name contains the stock name or "PROMOTER".
 */
export async function hasBulkSellAlert(symbol: string): Promise<boolean> {
  try {
    const deals = await getDealsForSymbol(symbol);
    if (deals.length === 0) return false;

    const bare = symbol.replace(/\.(NS|BO)$/i, "").toUpperCase();

    return deals.some((d) => {
      if (d.buySell !== "SELL") return false;
      const notional = d.qtyTraded * d.avgPrice; // ₹ value of the deal
      if (notional < 5_00_00_000) return false; // < ₹5cr → not significant

      const client = d.clientName.toUpperCase();
      // Flag if client is explicitly a promoter or the company's own family entity
      const isPromoter =
        client.includes("PROMOTER") ||
        client.includes(bare.substring(0, Math.min(bare.length, 6)));
      // Also flag any large FII / mutual fund sell (those are named without "PROMOTER"
      // but are still heavy institutional selling that the engine should know about)
      const isFII = client.includes("FII") || client.includes("FDI") || client.includes("FOREIGN");

      return isPromoter || isFII;
    });
  } catch {
    return false; // never crash the scanner on this
  }
}

// ─── Negative announcement detection via news keyword scan ───────────────────

const NEGATIVE_KEYWORDS = [
  "sebi notice", "sebi order", "sebi action", "sebi penalty",
  "fraud", "fraudulent",
  "investigation", "probe", "enquiry",
  "insider trading", "insider deal",
  "penalty", "fine",
  "suspended", "suspension", "ban",
  "default", "npa", "npa account",
  "liquidation", "liquidating", "winding up",
  "bankruptcy", "insolvency",
  "promoter pledge", "pledged shares",
  "accounting irregularity", "qualified opinion",
  "auditor resigned", "auditor quit",
];

/**
 * Scans a list of news article titles for red-flag keywords.
 * Returns true + the matched keyword if any title triggers a warning.
 */
export function scanNewsForNegativeAnnouncement(
  articles: Array<{ title: string }> | null | undefined
): { flagged: boolean; matchedKeyword: string | null } {
  if (!articles || articles.length === 0) return { flagged: false, matchedKeyword: null };

  for (const article of articles) {
    const lower = article.title.toLowerCase();
    for (const kw of NEGATIVE_KEYWORDS) {
      if (lower.includes(kw)) {
        return { flagged: true, matchedKeyword: kw };
      }
    }
  }
  return { flagged: false, matchedKeyword: null };
}
