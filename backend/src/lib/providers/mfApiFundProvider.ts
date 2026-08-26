import axios from "axios";
import type { FundDetail, FundProvider, FundScheme } from "./types";
import { cache, TTL } from "../cache";

const BASE = "https://api.mfapi.in/mf";

type RawNav = { date: string; nav: string };

/** "dd-mm-yyyy" (the AMFI convention this API mirrors) → Date */
function parseNavDate(d: string): Date {
  const [dd, mm, yyyy] = d.split("-").map(Number);
  return new Date(yyyy, (mm ?? 1) - 1, dd ?? 1);
}

function navOnOrBefore(history: Array<{ date: string; nav: number }>, target: Date): number | null {
  for (const point of history) {
    if (parseNavDate(point.date).getTime() <= target.getTime()) return point.nav;
  }
  return null;
}

function annualised(current: number, past: number | null, years: number): number | null {
  if (past == null || past <= 0) return null;
  if (years <= 1) return ((current - past) / past) * 100;
  return (Math.pow(current / past, 1 / years) - 1) * 100;
}

/**
 * Mutual-fund NAV data sourced from the public AMFI NAV feed (via api.mfapi.in).
 * Returns are computed from the published NAV history — nothing is estimated.
 */
export class MfApiFundProvider implements FundProvider {
  readonly id = "amfi-mfapi";

  private async allSchemes(): Promise<FundScheme[]> {
    const { value } = await cache.wrap<FundScheme[]>("funds:all", TTL.universe, async () => {
      const res = await axios.get(BASE, { timeout: 20000 });
      const rows: Array<{ schemeCode: number; schemeName: string }> = res.data ?? [];
      return rows.map((r) => ({ schemeCode: String(r.schemeCode), schemeName: r.schemeName }));
    });
    return value;
  }

  async search(query: string, limit = 25): Promise<FundScheme[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const all = await this.allSchemes();
    const scored = all
      .map((s) => {
        const name = s.schemeName.toLowerCase();
        let score = 0;
        if (name.startsWith(q)) score = 90;
        else if (name.includes(q)) score = 50;
        return { s, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.s.schemeName.length - b.s.schemeName.length);
    return scored.slice(0, limit).map((x) => x.s);
  }

  async getScheme(schemeCode: string): Promise<FundDetail | null> {
    const { value } = await cache.wrap<FundDetail | null>(`funds:${schemeCode}`, TTL.funds, async () => {
      const res = await axios.get(`${BASE}/${encodeURIComponent(schemeCode)}`, { timeout: 15000 });
      const meta = res.data?.meta;
      const raw: RawNav[] = res.data?.data ?? [];
      if (!meta || raw.length === 0) return null;

      const history = raw
        .map((r) => ({ date: r.date, nav: Number(r.nav) }))
        .filter((r) => Number.isFinite(r.nav));
      const latest = history[0];
      const now = parseNavDate(latest.date);
      const back = (months: number) => {
        const d = new Date(now);
        d.setMonth(d.getMonth() - months);
        return d;
      };

      return {
        schemeCode,
        schemeName: meta.scheme_name ?? "",
        fundHouse: meta.fund_house ?? undefined,
        category: [meta.scheme_type, meta.scheme_category].filter(Boolean).join(" · ") || undefined,
        nav: latest.nav,
        navDate: latest.date,
        history: history.slice(0, 1300), // ~5 years of business days
        returns: {
          oneMonth: annualised(latest.nav, navOnOrBefore(history, back(1)), 1 / 12),
          sixMonth: annualised(latest.nav, navOnOrBefore(history, back(6)), 0.5),
          oneYear: annualised(latest.nav, navOnOrBefore(history, back(12)), 1),
          threeYear: annualised(latest.nav, navOnOrBefore(history, back(36)), 3),
          fiveYear: annualised(latest.nav, navOnOrBefore(history, back(60)), 5),
        },
      };
    });
    return value;
  }
}
