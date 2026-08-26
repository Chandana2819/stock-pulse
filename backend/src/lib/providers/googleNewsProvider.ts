import Parser from "rss-parser";
import crypto from "crypto";
import type { NewsItem, NewsProvider } from "./types";
import { cache, TTL } from "../cache";

const parser = new Parser({ timeout: 9000 });

function stableId(link: string, title: string) {
  return crypto.createHash("sha1").update(`${link}|${title}`).digest("hex").slice(0, 24);
}

/**
 * Google News RSS. Free and public, but headline-only: there is no full text,
 * no publisher-supplied sentiment and no entity tagging. Everything derived
 * from it (sentiment, importance, affected symbols) is computed by our own
 * engine and labelled as such — we never present an inference as the source's.
 */
export class GoogleNewsProvider implements NewsProvider {
  readonly id = "google-news-rss";

  async getNews(query: string, limit = 12): Promise<NewsItem[]> {
    const key = `news:${query}:${limit}`;
    const { value } = await cache.wrap<NewsItem[]>(key, TTL.news, async () => {
      const feeds = [
        `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`,
        `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
      ];

      const settled = await Promise.allSettled(feeds.map((f) => parser.parseURL(f)));
      const items = settled.flatMap((s) => (s.status === "fulfilled" ? s.value.items : []));

      const seen = new Set<string>();
      return items
        .map((item) => {
          const title = item.title ?? "";
          const link = item.link ?? "";
          return {
            id: stableId(link, title),
            title,
            link,
            pubDate: item.pubDate ?? "",
            source: (item as { source?: { name?: string } }).source?.name ?? item.creator ?? "Google News",
          };
        })
        .filter((n) => {
          if (!n.title || seen.has(n.id)) return false;
          seen.add(n.id);
          return true;
        })
        .sort((a, b) => new Date(b.pubDate || 0).getTime() - new Date(a.pubDate || 0).getTime())
        .slice(0, limit);
    });
    return value;
  }
}
