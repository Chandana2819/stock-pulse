import axios from "axios";
import { cache, TTL } from "../cache";
import { env } from "../../config/env";
import { logger } from "../logger";

/**
 * Marketaux — a real (ML-scored) sentiment layer, used as a second opinion
 * ALONGSIDE our own lexicon-based sentiment (see ../engine/sentiment.ts), not
 * a replacement for it. Reasons this stays a supplement rather than the
 * primary source:
 *
 *  - Free tier is 100 requests/day. The scanner and decision engine run on
 *    hundreds of symbols continuously — Marketaux cannot serve that. Our own
 *    lexicon sentiment stays the engine's primary input; it is free,
 *    unlimited and fully explainable ("marked negative because of 'plunge'").
 *  - Optional: if MARKETAUX_API_KEY is not set, every call below resolves to
 *    null and callers must treat that as "no external sentiment available"
 *    rather than an error.
 *  - Cached hard (2h) per symbol so a burst of page views doesn't burn the
 *    daily quota.
 */

export type MarketauxSentiment = {
  score: number; // -1 … +1, Marketaux's own sentiment_score, averaged across matched articles
  label: "BULLISH" | "BEARISH" | "NEUTRAL";
  articleCount: number;
  topHeadline: { title: string; url: string; source: string; sentimentScore: number } | null;
};

const MARKETAUX_TTL = 2 * 60 * 60 * 1000; // 2h — protects the 100 req/day free quota

export async function getMarketauxSentiment(symbol: string): Promise<MarketauxSentiment | null> {
  if (!env.marketauxApiKey) return null;

  const bare = symbol.replace(/\.(NS|BO)$/i, "").toUpperCase();
  const key = `marketaux:${bare}`;

  const { value } = await cache.wrap<MarketauxSentiment | null>(key, MARKETAUX_TTL, async () => {
    try {
      const res = await axios.get("https://api.marketaux.com/v1/news/all", {
        params: {
          symbols: bare,
          filter_entities: true,
          language: "en",
          limit: 10,
          api_token: env.marketauxApiKey,
        },
        timeout: 8000,
        validateStatus: () => true,
      });

      if (res.status !== 200 || !Array.isArray(res.data?.data)) {
        if (res.status === 402 || res.status === 429) {
          logger.warn("[marketaux] quota exhausted or rate-limited", { status: res.status });
        }
        return null;
      }

      const articles = res.data.data as Array<{
        title: string; url: string; source: string;
        entities?: Array<{ symbol?: string; sentiment_score?: number }>;
      }>;
      if (articles.length === 0) return null;

      // Per-entity sentiment_score when Marketaux tagged our symbol on that
      // article; fall back to skipping articles where it didn't.
      const scored = articles
        .map((a) => {
          const entity = a.entities?.find((e) => e.symbol?.toUpperCase() === bare);
          const s = entity?.sentiment_score;
          return typeof s === "number" ? { ...a, sentimentScore: s } : null;
        })
        .filter((a): a is NonNullable<typeof a> => a !== null);

      if (scored.length === 0) return null;

      const avg = scored.reduce((acc, a) => acc + a.sentimentScore, 0) / scored.length;
      const label: MarketauxSentiment["label"] = avg > 0.1 ? "BULLISH" : avg < -0.1 ? "BEARISH" : "NEUTRAL";
      const top = [...scored].sort((a, b) => Math.abs(b.sentimentScore) - Math.abs(a.sentimentScore))[0];

      return {
        score: Number(avg.toFixed(3)),
        label,
        articleCount: scored.length,
        topHeadline: { title: top.title, url: top.url, source: top.source, sentimentScore: top.sentimentScore },
      };
    } catch (err) {
      logger.warn("[marketaux] fetch failed", { symbol: bare, err: String(err) });
      return null;
    }
  });
  return value;
}
