"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

type Fund = { schemeCode: string; schemeName: string };
type FundDetail = Fund & {
  fundHouse?: string;
  category?: string;
  nav: number | null;
  navDate: string | null;
  returns: { oneMonth: number | null; sixMonth: number | null; oneYear: number | null; threeYear: number | null; fiveYear: number | null };
};

type RankedFund = {
  schemeCode: string;
  schemeName: string;
  fundHouse: string;
  category: string;
  categoryLabel: string;
  nav: number | null;
  navDate: string | null;
  returns: { oneMonth: number | null; sixMonth: number | null; oneYear: number | null; threeYear: number | null; fiveYear: number | null };
};

const CATEGORY_ORDER = ["INDEX", "LARGE_CAP", "FLEXI_CAP", "MID_CAP", "SMALL_CAP", "ELSS", "DEBT"];

type GoalSuggestion = {
  category: string;
  categoryLabel: string;
  reason: string;
  feasibility: { classification: string; explanation: string };
  funds: RankedFund[];
};

type GoalOption = { id: string; name: string; targetDate: string; expectedReturn: number };

type OwnedMfHolding = {
  id: string;
  schemeCode: string;
  schemeName: string;
  folioNumber: string | null;
  units: number;
  avgNav: number;
  currentNav: number;
  navDate?: string | null;
  category?: string;
  fundHouse?: string;
  invested: number;
  currentValue: number;
  pl: number;
  plPct: number;
  source: string;
  broker: string | null;
};

type OwnedMfSummary = {
  totalInvested: number;
  totalValue: number;
  totalPl: number;
  totalPlPct: number;
  fundCount: number;
  totalUnits: number;
};

function Ret({ label, val }: { label: string; val: number | null }) {
  return (
    <div className="p-2.5 border border-border-custom bg-bg-2 text-center">
      <div className="font-mono text-[0.55rem] text-text-3 uppercase">{label}</div>
      <div className={`font-mono text-sm font-bold ${val == null ? "text-text-3" : val >= 0 ? "text-green-custom" : "text-red-custom"}`}>{val != null ? `${val >= 0 ? "+" : ""}${val.toFixed(1)}%` : "—"}</div>
    </div>
  );
}

export default function MutualFundsPage() {
  const [activeMainTab, setActiveMainTab] = useState<"EXPLORE" | "PORTFOLIO">("EXPLORE");
  const [ownedHoldings, setOwnedHoldings] = useState<OwnedMfHolding[]>([]);
  const [ownedSummary, setOwnedSummary] = useState<OwnedMfSummary | null>(null);
  const [ownedLoading, setOwnedLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Fund[]>([]);
  const [selected, setSelected] = useState<FundDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [sip, setSip] = useState({ monthly: "5000", years: "10" });
  const [projection, setProjection] = useState<{ futureValue: number; invested: number; gain: number; assumedAnnualReturnPct: number } | null>(null);

  const [byCategory, setByCategory] = useState<Record<string, RankedFund[]>>({});
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<string>("INDEX");
  const [recoLoading, setRecoLoading] = useState(true);

  // Goal-first flow: before showing generic "top of category" tabs, find out
  // the visitor's own timeline + return assumption (from an existing Goal if
  // they have one, or asked directly) and lead with a suggestion tailored to
  // that — the flat category list stays below for browsing everything else.
  const [existingGoals, setExistingGoals] = useState<GoalOption[] | null>(null);
  const [goalYears, setGoalYears] = useState("10");
  const [goalReturn, setGoalReturn] = useState("12");
  const [goalSuggestion, setGoalSuggestion] = useState<GoalSuggestion | null>(null);
  const [goalSuggestLoading, setGoalSuggestLoading] = useState(false);
  const [goalPromptDismissed, setGoalPromptDismissed] = useState(false);

  const fetchGoalSuggestion = useCallback(async (years: number, expectedReturnPct: number) => {
    setGoalSuggestLoading(true);
    try {
      const res = await api.get<GoalSuggestion>(`/api/mutual-funds/suggest-for-goal?years=${years}&expectedReturnPct=${expectedReturnPct}`);
      setGoalSuggestion(res);
    } catch {
      setGoalSuggestion(null);
    } finally {
      setGoalSuggestLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const goals = await api.get<GoalOption[]>("/api/goals");
        setExistingGoals(goals);
        if (goals.length > 0) {
          const nearest = goals.reduce((a, b) => (new Date(a.targetDate).getTime() < new Date(b.targetDate).getTime() ? a : b));
          const years = Math.max(0.1, (new Date(nearest.targetDate).getTime() - Date.now()) / (365 * 24 * 3600 * 1000));
          fetchGoalSuggestion(years, nearest.expectedReturn);
        }
      } catch {
        setExistingGoals([]);
      }
    })();
  }, [fetchGoalSuggestion]);

  const submitGoalPrompt = () => {
    const years = Number(goalYears);
    const ret = Number(goalReturn);
    if (!years || years <= 0 || !Number.isFinite(ret)) return;
    fetchGoalSuggestion(years, ret);
  };

  const loadRecommendations = useCallback(async () => {
    setRecoLoading(true);
    try {
      const res = await api.get<{ byCategory: Record<string, RankedFund[]>; categories: Record<string, string> }>("/api/mutual-funds/recommendations");
      setByCategory(res.byCategory);
      setCategoryLabels(res.categories);
    } catch {
      setByCategory({});
    } finally {
      setRecoLoading(false);
    }
  }, []);

  const loadOwnedHoldings = useCallback(async () => {
    setOwnedLoading(true);
    try {
      const res = await api.get<{ holdings: OwnedMfHolding[]; summary: OwnedMfSummary }>("/api/mutual-funds/holdings/mine");
      setOwnedHoldings(res.holdings || []);
      setOwnedSummary(res.summary || null);
    } catch {
      setOwnedHoldings([]);
      setOwnedSummary(null);
    } finally {
      setOwnedLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecommendations();
    loadOwnedHoldings();
  }, [loadRecommendations, loadOwnedHoldings]);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await api.get<{ results: Fund[] }>(`/api/mutual-funds/search?q=${encodeURIComponent(query)}`);
      setResults(res.results);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const select = async (f: Fund) => {
    setLoading(true);
    setProjection(null);
    try {
      const detail = await api.get<FundDetail>(`/api/mutual-funds/${f.schemeCode}`);
      setSelected(detail);
    } catch {
      setSelected(null);
    } finally {
      setLoading(false);
    }
  };

  const runSip = async () => {
    if (!selected) return;
    try {
      const p = await api.get<{ futureValue: number; invested: number; gain: number; assumedAnnualReturnPct: number }>(
        `/api/mutual-funds/${selected.schemeCode}/sip-projection?monthly=${sip.monthly}&years=${sip.years}`
      );
      setProjection(p);
    } catch {}
  };

  return (
    <div className="max-w-[900px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl tracking-[0.1em] text-text-custom">MUTUAL FUNDS</h1>
        <p className="font-mono text-[0.65rem] text-text-3 mt-1">NAV & returns sourced from the public AMFI feed — search any scheme.</p>
      </div>

      {/* Main Tabs */}
      <div className="flex border-b border-border-custom gap-2">
        <button
          type="button"
          onClick={() => { setActiveMainTab("EXPLORE"); setSelected(null); }}
          className={`font-mono text-xs font-bold px-4 py-2.5 border-b-2 transition-all cursor-pointer ${
            activeMainTab === "EXPLORE"
              ? "border-green-custom text-green-custom bg-green-custom/10"
              : "border-transparent text-text-3 hover:text-text-custom"
          }`}
        >
          EXPLORE &amp; RECOMMENDATIONS
        </button>
        <button
          type="button"
          onClick={() => { setActiveMainTab("PORTFOLIO"); setSelected(null); }}
          className={`font-mono text-xs font-bold px-4 py-2.5 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeMainTab === "PORTFOLIO"
              ? "border-green-custom text-green-custom bg-green-custom/10"
              : "border-transparent text-text-3 hover:text-text-custom"
          }`}
        >
          <span>MY OWNED FUNDS</span>
          <span className={`text-[0.62rem] px-1.5 py-0.2 rounded ${activeMainTab === "PORTFOLIO" ? "bg-green-custom/20 text-green-custom" : "bg-bg-2 text-text-3"}`}>
            {ownedHoldings.length}
          </span>
        </button>
      </div>

      {/* Owned Portfolio View */}
      {activeMainTab === "PORTFOLIO" && !selected && (
        <div className="flex flex-col gap-4">
          {ownedSummary && ownedHoldings.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-bg-1 border border-border-custom p-4">
                <div className="font-mono text-[0.55rem] text-text-3 uppercase tracking-wider">TOTAL INVESTED</div>
                <div className="font-mono text-lg font-bold text-text-custom mt-1">
                  ₹{ownedSummary.totalInvested.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="bg-bg-1 border border-border-custom p-4">
                <div className="font-mono text-[0.55rem] text-text-3 uppercase tracking-wider">CURRENT VALUE</div>
                <div className="font-mono text-lg font-bold text-cyan-custom mt-1">
                  ₹{ownedSummary.totalValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="bg-bg-1 border border-border-custom p-4">
                <div className="font-mono text-[0.55rem] text-text-3 uppercase tracking-wider">TOTAL RETURNS</div>
                <div className={`font-mono text-lg font-bold mt-1 ${ownedSummary.totalPl >= 0 ? "text-green-custom" : "text-red-custom"}`}>
                  {ownedSummary.totalPl >= 0 ? "+" : ""}₹{ownedSummary.totalPl.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  <span className="text-xs ml-1 font-normal">
                    ({ownedSummary.totalPl >= 0 ? "+" : ""}{ownedSummary.totalPlPct.toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>
          )}

          {ownedLoading ? (
            <div className="font-mono text-xs text-text-3 text-center py-8 bg-bg-1 border border-border-custom">
              Loading your mutual fund holdings...
            </div>
          ) : ownedHoldings.length === 0 ? (
            <div className="border border-dashed border-border-custom bg-bg-1 p-8 text-center flex flex-col items-center gap-3">
              <div className="font-display text-base text-text-custom">NO OWNED FUNDS FOUND</div>
              <p className="font-mono text-xs text-text-3 max-w-md">
                You haven't added any mutual fund holdings yet. You can add them in your Portfolio tab, sync with Zerodha Kite, or search and explore funds below.
              </p>
              <a
                href="/portfolio"
                className="font-mono text-xs font-bold px-4 py-2 bg-green-custom text-bg rounded cursor-pointer hover:opacity-90 inline-block"
              >
                GO TO PORTFOLIO TO ADD FUNDS →
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="font-mono text-[0.62rem] text-text-3 uppercase tracking-wider font-bold">
                  {ownedHoldings.length} HOLDINGS RECORDED
                </span>
                <a
                  href="/portfolio"
                  className="font-mono text-[0.62rem] text-green-custom hover:underline"
                >
                  Manage / Add More in Portfolio →
                </a>
              </div>

              <div className="divide-y divide-border-custom border border-border-custom bg-bg-1">
                {ownedHoldings.map((h) => (
                  <div key={h.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-bg-2/40 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-text-custom">{h.schemeName}</div>
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[0.62rem] text-text-3 mt-1">
                        {h.category && <span className="bg-bg-2 px-1.5 py-0.5 rounded text-text-2">{h.category}</span>}
                        {h.folioNumber && <span>Folio: {h.folioNumber}</span>}
                        <span>{h.units.toFixed(3)} units @ ₹{h.avgNav.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 self-end sm:self-center shrink-0">
                      <div className="text-right">
                        <div className="font-mono text-xs text-text-3">LTP: ₹{h.currentNav.toFixed(2)}</div>
                        <div className="font-mono text-sm font-bold text-text-custom">
                          ₹{h.currentValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </div>
                        <div className={`font-mono text-[0.62rem] font-bold ${h.pl >= 0 ? "text-green-custom" : "text-red-custom"}`}>
                          {h.pl >= 0 ? "+" : ""}₹{h.pl.toFixed(2)} ({h.pl >= 0 ? "+" : ""}{h.plPct.toFixed(2)}%)
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => select({ schemeCode: h.schemeCode, schemeName: h.schemeName })}
                        className="font-mono text-xs px-3 py-1.5 border border-border-custom text-text-custom hover:border-green-custom hover:text-green-custom transition-colors cursor-pointer"
                        title="View fund history &amp; SIP calculator"
                      >
                        CALCULATE SIP
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Goal-first suggestion */}
      {activeMainTab === "EXPLORE" && !selected && existingGoals !== null && !goalSuggestLoading && !goalSuggestion && !goalPromptDismissed && (
        <div className="border border-border-bright bg-bg-1 p-5 flex flex-col gap-4">
          <div>
            <h2 className="font-display text-lg text-text-custom">WHAT ARE YOU INVESTING FOR?</h2>
            <p className="font-mono text-[0.6rem] text-text-3 mt-0.5">
              Tell us your timeline and expected return, and we'll suggest a fund category that actually fits — not just a generic top-of-category list.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block font-mono text-[0.55rem] text-text-3 mb-1">Timeline (years)</label>
              <input
                value={goalYears}
                onChange={(e) => setGoalYears(e.target.value)}
                type="number"
                className="bg-bg-2 border border-border-custom p-2.5 text-sm font-mono text-text-custom outline-none w-28 focus:border-green-custom"
              />
            </div>
            <div>
              <label className="block font-mono text-[0.55rem] text-text-3 mb-1">Expected return % p.a.</label>
              <input
                value={goalReturn}
                onChange={(e) => setGoalReturn(e.target.value)}
                type="number"
                className="bg-bg-2 border border-border-custom p-2.5 text-sm font-mono text-text-custom outline-none w-28 focus:border-green-custom"
              />
            </div>
            <button onClick={submitGoalPrompt} disabled={goalSuggestLoading} className="font-mono text-xs font-bold px-5 py-2.5 bg-green-custom text-bg border-none cursor-pointer disabled:opacity-50">
              {goalSuggestLoading ? "..." : "GET SUGGESTION"}
            </button>
            <button onClick={() => setGoalPromptDismissed(true)} className="font-mono text-[0.6rem] text-text-3 underline bg-transparent border-none cursor-pointer px-2">
              Skip, just show me everything
            </button>
          </div>
        </div>
      )}

      {!selected && goalSuggestion && (
        <div className="border border-green-custom bg-green-dim p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg text-green-custom">
                SUGGESTED FOR YOUR GOAL: {goalSuggestion.categoryLabel.toUpperCase()}
              </h2>
              <p className="text-xs text-text-2 leading-relaxed mt-1">{goalSuggestion.reason}</p>
              <p className="font-mono text-[0.58rem] text-text-3 mt-2">{goalSuggestion.feasibility.explanation}</p>
            </div>
            <button
              onClick={() => { setGoalSuggestion(null); setGoalPromptDismissed(false); }}
              className="font-mono text-[0.6rem] text-text-3 underline bg-transparent border-none cursor-pointer shrink-0"
            >
              Change answers
            </button>
          </div>
          {goalSuggestion.funds.length > 0 && (
            <div className="flex flex-col gap-2">
              {goalSuggestion.funds.slice(0, 3).map((f, i) => (
                <button
                  key={f.schemeCode}
                  onClick={() => select({ schemeCode: f.schemeCode, schemeName: f.schemeName })}
                  className="text-left border border-border-custom bg-bg-1 p-3 flex items-center justify-between gap-3 hover:border-green-custom transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-[0.5rem] text-text-4">#{i + 1}</div>
                    <div className="text-xs text-text-custom font-bold truncate">{f.schemeName}</div>
                    <div className="font-mono text-[0.58rem] text-text-3">{f.fundHouse}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-[0.5rem] text-text-3 uppercase">3Y (ann.)</div>
                    <div className={`font-mono text-sm font-bold ${(f.returns.threeYear ?? f.returns.fiveYear ?? 0) >= 0 ? "text-green-custom" : "text-red-custom"}`}>
                      {f.returns.threeYear != null
                        ? `${f.returns.threeYear >= 0 ? "+" : ""}${f.returns.threeYear.toFixed(1)}%`
                        : f.returns.fiveYear != null
                        ? `${f.returns.fiveYear >= 0 ? "+" : ""}${f.returns.fiveYear.toFixed(1)}% (5Y)`
                        : "—"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recommended Funds */}
      {activeMainTab === "EXPLORE" && !selected && (
      <div className="border border-border-bright bg-bg-1 p-5 flex flex-col gap-4">
        <div>
          <h2 className="font-display text-lg text-text-custom">RECOMMENDED FUNDS</h2>
          <p className="font-mono text-[0.6rem] text-text-3 mt-0.5">
            A curated set of well-known schemes, ranked by real trailing 3-year return within each category — past performance, not a guarantee of future returns.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_ORDER.filter((c) => byCategory[c]?.length).map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={`font-mono text-[0.6rem] px-2.5 py-1 border ${activeCategory === c ? "border-green-custom text-green-custom bg-green-dim" : "border-border-custom text-text-3"}`}
            >
              {categoryLabels[c] ?? c}
            </button>
          ))}
        </div>

        {recoLoading ? (
          <div className="font-mono text-xs text-text-3 text-center py-4">Loading...</div>
        ) : (byCategory[activeCategory]?.length ?? 0) === 0 ? (
          <div className="font-mono text-xs text-text-3 text-center py-4">No funds available for this category right now.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {byCategory[activeCategory].map((f, i) => (
              <button
                key={f.schemeCode}
                onClick={() => select(f)}
                className="text-left border border-border-custom bg-bg-2 p-3 flex items-center justify-between gap-3 hover:border-green-custom transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-mono text-[0.5rem] text-text-4">#{i + 1}</div>
                  <div className="text-xs text-text-custom font-bold truncate">{f.schemeName}</div>
                  <div className="font-mono text-[0.58rem] text-text-3">{f.fundHouse}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-[0.5rem] text-text-3 uppercase">3Y (ann.)</div>
                  <div className={`font-mono text-sm font-bold ${(f.returns.threeYear ?? f.returns.fiveYear ?? 0) >= 0 ? "text-green-custom" : "text-red-custom"}`}>
                    {f.returns.threeYear != null
                      ? `${f.returns.threeYear >= 0 ? "+" : ""}${f.returns.threeYear.toFixed(1)}%`
                      : f.returns.fiveYear != null
                      ? `${f.returns.fiveYear >= 0 ? "+" : ""}${f.returns.fiveYear.toFixed(1)}% (5Y)`
                      : "—"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search fund name (e.g. Parag Parikh Flexi Cap)"
          className="flex-1 bg-bg-2 border border-border-bright p-3 text-sm font-mono text-text-custom outline-none focus:border-green-custom"
        />
        <button onClick={search} className="font-mono text-xs font-bold px-5 bg-green-custom text-bg border-none cursor-pointer">{loading ? "..." : "SEARCH"}</button>
      </div>

      {results.length > 0 && !selected && (
        <div className="border border-border-bright bg-bg-1 divide-y divide-border-custom max-h-80 overflow-y-auto">
          {results.map((f) => (
            <button key={f.schemeCode} onClick={() => select(f)} className="w-full text-left p-3 text-xs font-mono text-text-2 hover:bg-bg-2 hover:text-text-custom">
              {f.schemeName}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-display text-xl text-text-custom">{selected.schemeName}</div>
              <div className="font-mono text-[0.6rem] text-text-3 mt-1">{selected.fundHouse} · {selected.category}</div>
            </div>
            <button onClick={() => { setSelected(null); setResults([]); }} className="text-text-3 hover:text-text-custom">✕</button>
          </div>

          <div className="flex items-baseline gap-3">
            <span className="font-mono text-2xl font-bold text-text-custom">₹{selected.nav?.toFixed(4) ?? "—"}</span>
            <span className="font-mono text-[0.6rem] text-text-3">NAV as of {selected.navDate}</span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            <Ret label="1M" val={selected.returns.oneMonth} />
            <Ret label="6M" val={selected.returns.sixMonth} />
            <Ret label="1Y" val={selected.returns.oneYear} />
            <Ret label="3Y (ann.)" val={selected.returns.threeYear} />
            <Ret label="5Y (ann.)" val={selected.returns.fiveYear} />
          </div>

          <div className="border-t border-border-custom pt-4">
            <div className="font-mono text-[0.58rem] tracking-[0.15em] text-text-3 uppercase mb-2">SIP PROJECTION</div>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="block font-mono text-[0.55rem] text-text-3">Monthly ₹</label>
                <input value={sip.monthly} onChange={(e) => setSip({ ...sip, monthly: e.target.value })} className="bg-bg-2 border border-border-custom p-2 text-xs font-mono text-text-custom outline-none w-24" />
              </div>
              <div>
                <label className="block font-mono text-[0.55rem] text-text-3">Years</label>
                <input value={sip.years} onChange={(e) => setSip({ ...sip, years: e.target.value })} className="bg-bg-2 border border-border-custom p-2 text-xs font-mono text-text-custom outline-none w-20" />
              </div>
              <button onClick={runSip} className="font-mono text-xs font-bold px-4 py-2 bg-green-custom text-bg border-none cursor-pointer">CALCULATE</button>
            </div>
            {projection && (
              <div className="grid grid-cols-3 gap-2 mt-3 text-xs font-mono">
                <div className="p-2 border border-border-custom bg-bg-2"><div className="text-text-3 text-[0.55rem]">INVESTED</div><div className="text-text-custom font-bold">₹{Math.round(projection.invested).toLocaleString("en-IN")}</div></div>
                <div className="p-2 border border-border-custom bg-bg-2"><div className="text-text-3 text-[0.55rem]">FUTURE VALUE</div><div className="text-green-custom font-bold">₹{Math.round(projection.futureValue).toLocaleString("en-IN")}</div></div>
                <div className="p-2 border border-border-custom bg-bg-2"><div className="text-text-3 text-[0.55rem]">ASSUMED RETURN</div><div className="text-text-custom font-bold">{projection.assumedAnnualReturnPct}%</div></div>
              </div>
            )}
            <div className="font-mono text-[0.55rem] text-text-4 mt-2">Projection uses the fund's own trailing return as an assumption — not a promise of future performance.</div>
          </div>
        </div>
      )}
    </div>
  );
}
