"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

type EvaluationStatus = "PENDING" | "TARGET_HIT" | "STOP_LOSS_HIT" | "EXPIRED" | "AMBIGUOUS" | "INSUFFICIENT_DATA" | "NOT_APPLICABLE";

type Evaluation = {
  horizon: number; status: EvaluationStatus;
  entryReached: boolean | null; targetReached: boolean | null; stopLossReached: boolean | null;
  daysToOutcome: number | null; highestPrice: number | null; lowestPrice: number | null; closingPrice: number | null;
  actualReturnPct: number | null; note: string | null;
};

type Prediction = { ticker: string; action: string | null; score: number | null; confidence: number | null; risk: string | null; sector: string | null; logicVersion: string; reasons: string[]; evaluation: Evaluation };

type ReviewBreakdown = {
  total: number; targetHit: number; stopLossHit: number; neither: number; pending: number; notApplicable: number; insufficientData: number; ambiguous: number;
  targetHitRate: number | null; stopLossRate: number | null; avgReturnPct: number | null; avgScore: number | null; avgConfidence: number | null; avgDaysToTarget: number | null;
};

type LogicVerdict = { verdict: "CONTINUE" | "NEEDS_TESTING" | "INSUFFICIENT_DATA_FOR_DECISION"; message: string; currentHitRate: number | null; priorHitRate: number | null; sampleSize: number };

const STATUS_LABEL: Record<EvaluationStatus, string> = {
  PENDING: "PENDING", TARGET_HIT: "TARGET HIT", STOP_LOSS_HIT: "STOP LOSS HIT", EXPIRED: "EXPIRED", AMBIGUOUS: "AMBIGUOUS", INSUFFICIENT_DATA: "INSUFFICIENT DATA", NOT_APPLICABLE: "N/A (HOLD)",
};
const STATUS_COLOR: Record<EvaluationStatus, string> = {
  PENDING: "text-amber-custom", TARGET_HIT: "text-green-custom", STOP_LOSS_HIT: "text-red-custom", EXPIRED: "text-text-3", AMBIGUOUS: "text-amber-custom", INSUFFICIENT_DATA: "text-text-4", NOT_APPLICABLE: "text-blue-custom",
};

const TABS = ["Prediction History", "Weekly Review", "Monthly Review", "Logic Performance", "Failure Analysis", "Timeline"] as const;
type Tab = (typeof TABS)[number];

const pct = (n: number | null, digits = 1) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`);
const numFmt = (n: number | null, digits = 1) => (n == null ? "—" : n.toFixed(digits));

function BreakdownGrid({ b }: { b: ReviewBreakdown }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        ["Total", b.total.toString()],
        ["Target Hit", b.targetHit.toString()],
        ["Stop-Loss Hit", b.stopLossHit.toString()],
        ["Neither / Expired", b.neither.toString()],
        ["Pending", b.pending.toString()],
        ["Target Hit Rate", b.targetHitRate != null ? `${b.targetHitRate.toFixed(1)}%` : "—"],
        ["Stop-Loss Rate", b.stopLossRate != null ? `${b.stopLossRate.toFixed(1)}%` : "—"],
        ["Avg Return", pct(b.avgReturnPct)],
        ["Avg Score", numFmt(b.avgScore)],
        ["Avg Confidence", b.avgConfidence != null ? `${b.avgConfidence.toFixed(0)}%` : "—"],
        ["Avg Days to Target", numFmt(b.avgDaysToTarget)],
      ].map(([label, value]) => (
        <div key={label} className="border border-border-custom bg-bg-2 p-3">
          <div className="font-mono text-[0.55rem] text-text-3 uppercase">{label}</div>
          <div className="font-mono text-sm font-bold text-text-custom mt-1">{value}</div>
        </div>
      ))}
    </div>
  );
}

export default function PredictionLearningDashboard() {
  const [tab, setTab] = useState<Tab>("Prediction History");

  return (
    <div className="max-w-[1200px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-6">
      <div>
        <Link href="/stock-learning" className="font-mono text-[0.6rem] text-text-3 hover:text-text-custom underline">
          ← STOCK LEARNING &amp; REVIEW
        </Link>
        <h1 className="font-display text-3xl tracking-[0.1em] text-text-custom mt-1">PREDICTION ACCURACY DASHBOARD</h1>
        <p className="text-xs text-text-3 leading-relaxed max-w-3xl mt-1">
          Every prediction BullHawk has ever generated, checked against real historical market prices — not just the stocks you own. Target/stop-loss
          outcomes are computed fresh from real OHLC data every time; nothing here is invented or guessed.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border-custom overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`font-mono text-[0.62rem] tracking-wider uppercase px-4 py-2.5 whitespace-nowrap border-b-2 ${tab === t ? "border-green-custom text-green-custom" : "border-transparent text-text-3 hover:text-text-custom"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Prediction History" && <PredictionHistoryTab />}
      {tab === "Weekly Review" && <WeeklyReviewTab />}
      {tab === "Monthly Review" && <MonthlyReviewTab />}
      {tab === "Logic Performance" && <LogicPerformanceTab />}
      {tab === "Failure Analysis" && <FailureAnalysisTab />}
      {tab === "Timeline" && <TimelineTab />}
    </div>
  );
}

function PredictionHistoryTab() {
  const [status, setStatus] = useState<string>("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    api
      .get<{ predictions: Prediction[] }>(`/api/stock-learning/predictions?${params.toString()}`)
      .then((d) => setPredictions(d.predictions))
      .catch(() => setPredictions([]))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (ticker: string) => {
    // predictions list doesn't carry the row id, so re-fetch by ticker+status filter is overkill — fetch fresh list scoped and pick.
    const res = await api.get<{ predictions: any[] }>(`/api/stock-learning/predictions?ticker=${encodeURIComponent(ticker)}`);
    setDetail(res.predictions[0] ?? null);
  };

  return (
    <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {["", "PENDING", "TARGET_HIT", "STOP_LOSS_HIT", "EXPIRED", "AMBIGUOUS", "INSUFFICIENT_DATA", "NOT_APPLICABLE"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`font-mono text-[0.6rem] px-3 py-1.5 border ${status === s ? "border-green-custom text-green-custom bg-green-dim" : "border-border-custom text-text-3"}`}
          >
            {s === "" ? "ALL" : STATUS_LABEL[s as EvaluationStatus]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="font-mono text-xs text-text-3 animate-pulse text-center py-6">Loading predictions…</div>
      ) : predictions.length === 0 ? (
        <div className="border border-border-custom bg-bg-2 p-6 text-center text-xs text-text-3 font-mono">No predictions match this filter yet.</div>
      ) : (
        <div className="overflow-x-auto border border-border-custom max-h-[500px] overflow-y-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="sticky top-0 bg-bg-2">
              <tr className="font-mono text-[0.58rem] text-text-3 uppercase border-b border-border-custom">
                <th className="py-2 px-3">Stock</th>
                <th className="py-2 px-2 text-center">Action</th>
                <th className="py-2 px-2 text-right">Score</th>
                <th className="py-2 px-2 text-right">Confidence</th>
                <th className="py-2 px-2 text-center">Status (10d)</th>
                <th className="py-2 px-2 text-right">Return</th>
                <th className="py-2 px-2 text-center">Details</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map((p, i) => (
                <tr key={i} className="text-xs border-b border-border-custom hover:bg-bg-2">
                  <td className="py-2 px-3 font-bold font-display">{p.ticker}</td>
                  <td className="py-2 px-2 text-center font-mono">{p.action ?? "—"}</td>
                  <td className="py-2 px-2 text-right font-mono">{p.score ?? "—"}</td>
                  <td className="py-2 px-2 text-right font-mono">{p.confidence != null ? `${p.confidence}%` : "—"}</td>
                  <td className={`py-2 px-2 text-center font-mono font-bold ${STATUS_COLOR[p.evaluation.status]}`}>{STATUS_LABEL[p.evaluation.status]}</td>
                  <td className="py-2 px-2 text-right font-mono">{pct(p.evaluation.actualReturnPct)}</td>
                  <td className="py-2 px-2 text-center">
                    <button onClick={() => openDetail(p.ticker)} className="font-mono text-[0.58rem] border border-border-bright px-2 py-1 hover:bg-bg-3">
                      VIEW →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="border border-green-custom bg-bg-2 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-display text-lg text-text-custom">{detail.ticker}</span>
            <button onClick={() => setDetail(null)} className="font-mono text-[0.6rem] text-text-3 hover:text-text-custom">
              ✕ CLOSE
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-border-custom bg-bg-1 p-3">
              <div className="font-mono text-[0.6rem] text-text-3 uppercase mb-1">BullHawk Prediction</div>
              <div className="text-xs text-text-2 font-mono">Action: {detail.action ?? "—"}</div>
              <div className="text-xs text-text-2 font-mono">Score: {detail.score ?? "—"} · Confidence: {detail.confidence != null ? `${detail.confidence}%` : "—"} · Risk: {detail.risk ?? "—"}</div>
              <div className="text-xs text-text-2 font-mono">Logic Version: {detail.logicVersion}</div>
            </div>
            <div className="border border-border-custom bg-bg-1 p-3">
              <div className="font-mono text-[0.6rem] text-text-3 uppercase mb-1">Actual Result (10-day)</div>
              <div className={`text-xs font-mono font-bold ${STATUS_COLOR[detail.evaluation.status as EvaluationStatus]}`}>{STATUS_LABEL[detail.evaluation.status as EvaluationStatus]}</div>
              <div className="text-xs text-text-2 font-mono">Highest: {numFmt(detail.evaluation.highestPrice, 2)} · Lowest: {numFmt(detail.evaluation.lowestPrice, 2)}</div>
              <div className="text-xs text-text-2 font-mono">Days to outcome: {detail.evaluation.daysToOutcome ?? "—"} · Return: {pct(detail.evaluation.actualReturnPct)}</div>
              {detail.evaluation.note && <div className="text-[0.62rem] text-amber-custom font-mono mt-1">{detail.evaluation.note}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WeeklyReviewTab() {
  const [week, setWeek] = useState<string>(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return monday.toISOString().slice(0, 10);
  });
  const [data, setData] = useState<{ overall: ReviewBreakdown; byAction: Record<string, ReviewBreakdown>; tradingDaysUploaded: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<any>(`/api/stock-learning/review/weekly?week=${week}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [week]);

  return (
    <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <label className="font-mono text-[0.6rem] text-text-3 uppercase">Week starting (Monday)</label>
        <input type="date" value={week} onChange={(e) => setWeek(e.target.value)} className="font-mono text-xs bg-bg border border-border-custom text-text-2 px-2 py-1" />
      </div>
      {loading ? (
        <div className="font-mono text-xs text-text-3 animate-pulse text-center py-6">Loading…</div>
      ) : !data || data.overall.total === 0 ? (
        <div className="border border-border-custom bg-bg-2 p-6 text-center text-xs text-text-3 font-mono">No predictions uploaded for this week.</div>
      ) : (
        <>
          <div className="font-mono text-[0.6rem] text-text-3">{data.tradingDaysUploaded} day(s) of uploads this week.</div>
          <BreakdownGrid b={data.overall} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            {Object.entries(data.byAction).map(([action, b]) => (
              <div key={action} className="border border-border-custom bg-bg-2 p-4">
                <div className="font-mono text-[0.62rem] text-text-3 uppercase mb-2">{action}</div>
                <BreakdownGrid b={b} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function MonthlyReviewTab() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<any>(`/api/stock-learning/review/monthly?month=${month}&year=${year}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [month, year]);

  return (
    <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="font-mono text-[0.62rem] bg-bg border border-border-custom text-text-2 p-1.5">
          {MONTH_NAMES.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="font-mono text-[0.62rem] bg-bg border border-border-custom text-text-2 p-1.5">
          {[year - 1, year, year + 1].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="font-mono text-xs text-text-3 animate-pulse text-center py-6">Loading…</div>
      ) : !data || data.overall.total === 0 ? (
        <div className="border border-border-custom bg-bg-2 p-6 text-center text-xs text-text-3 font-mono">No predictions uploaded for {MONTH_NAMES[month - 1]} {year}.</div>
      ) : (
        <>
          <div className={`border p-4 font-mono text-xs ${data.logicVerdict.verdict === "CONTINUE" ? "border-green-custom bg-green-dim text-green-custom" : data.logicVerdict.verdict === "NEEDS_TESTING" ? "border-red-custom bg-red-dim text-red-custom" : "border-amber-custom bg-amber-dim text-amber-custom"}`}>
            <div className="font-bold uppercase mb-1">Logic Verdict: {data.logicVerdict.verdict.replace(/_/g, " ")}</div>
            {data.logicVerdict.message}
          </div>

          <BreakdownGrid b={data.overall} />

          {[
            ["By Action", data.byAction],
            ["By Score Range", data.byScoreRange],
            ["By Confidence Range", data.byConfidenceRange],
            ["By Risk", data.byRisk],
            ["By Sector", data.bySector],
          ].map(([title, breakdown]) => (
            <div key={title as string} className="mt-2">
              <div className="font-mono text-[0.62rem] text-text-3 uppercase mb-2">{title as string}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(breakdown as Record<string, ReviewBreakdown>)
                  .filter(([, b]) => b.total > 0)
                  .map(([key, b]) => (
                    <div key={key} className="border border-border-custom bg-bg-2 p-3">
                      <div className="font-mono text-xs font-bold text-text-custom mb-1">{key}</div>
                      <div className="font-mono text-[0.6rem] text-text-3">
                        {b.total} predictions · Target hit rate: {b.targetHitRate != null ? `${b.targetHitRate.toFixed(1)}%` : "—"} · Avg return: {pct(b.avgReturnPct)}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function LogicPerformanceTab() {
  const [versions, setVersions] = useState<(ReviewBreakdown & { logicVersion: string; failureRate: number | null })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ versions: any[] }>("/api/stock-learning/logic-performance")
      .then((d) => setVersions(d.versions))
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-4">
      <p className="text-xs text-text-3 font-mono">Every prediction is tagged with the logic version that generated it at upload time — old predictions are never retroactively rewritten when you tag a new version.</p>
      {loading ? (
        <div className="font-mono text-xs text-text-3 animate-pulse text-center py-6">Loading…</div>
      ) : versions.length === 0 ? (
        <div className="border border-border-custom bg-bg-2 p-6 text-center text-xs text-text-3 font-mono">No predictions uploaded yet.</div>
      ) : (
        <div className="overflow-x-auto border border-border-custom">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="font-mono text-[0.58rem] text-text-3 uppercase border-b border-border-custom bg-bg-2">
                <th className="py-2 px-3">Logic Version</th>
                <th className="py-2 px-2 text-right">Predictions</th>
                <th className="py-2 px-2 text-right">Target Hit Rate</th>
                <th className="py-2 px-2 text-right">Failure Rate</th>
                <th className="py-2 px-2 text-right">Avg Return</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.logicVersion} className="text-xs border-b border-border-custom">
                  <td className="py-2 px-3 font-bold font-mono">{v.logicVersion}</td>
                  <td className="py-2 px-2 text-right font-mono">{v.total}</td>
                  <td className="py-2 px-2 text-right font-mono">{v.targetHitRate != null ? `${v.targetHitRate.toFixed(1)}%` : "—"}</td>
                  <td className="py-2 px-2 text-right font-mono">{v.failureRate != null ? `${v.failureRate.toFixed(1)}%` : "—"}</td>
                  <td className="py-2 px-2 text-right font-mono">{pct(v.avgReturnPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FailureAnalysisTab() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<any>(`/api/stock-learning/failure-analysis?month=${month}&year=${year}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [month, year]);

  return (
    <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="font-mono text-[0.62rem] bg-bg border border-border-custom text-text-2 p-1.5">
          {MONTH_NAMES.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="font-mono text-[0.62rem] bg-bg border border-border-custom text-text-2 p-1.5">
          {[year - 1, year, year + 1].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="font-mono text-xs text-text-3 animate-pulse text-center py-6">Loading…</div>
      ) : !data || data.totalEvaluated === 0 ? (
        <div className="border border-border-custom bg-bg-2 p-6 text-center text-xs text-text-3 font-mono">No evaluated predictions for this period.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["Total Evaluated", data.totalEvaluated],
              ["Stop-Loss Failures", data.totalFailures],
              ["Target Successes", data.totalSuccesses],
              ["High-Confidence Failures", data.highConfidenceFailures],
              ["High-Score Failures", data.highScoreFailures],
            ].map(([label, value]) => (
              <div key={label as string} className="border border-border-custom bg-bg-2 p-3">
                <div className="font-mono text-[0.55rem] text-text-3 uppercase">{label as string}</div>
                <div className="font-mono text-sm font-bold text-text-custom mt-1">{value as number}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="font-mono text-[0.6rem] text-red-custom uppercase mb-2">Where BullHawk Failed — Common Conditions</div>
              {data.commonFailureReasons.length === 0 ? (
                <div className="text-xs text-text-4 font-mono">No stop-loss hits recorded yet for this period.</div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {data.commonFailureReasons.map((r: any, i: number) => (
                    <li key={i} className="text-xs text-text-2">{r.text}: <b>{r.count}</b></li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="font-mono text-[0.6rem] text-green-custom uppercase mb-2">Where BullHawk Worked — Common Conditions</div>
              {data.commonSuccessReasons.length === 0 ? (
                <div className="text-xs text-text-4 font-mono">No target hits recorded yet for this period.</div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {data.commonSuccessReasons.map((r: any, i: number) => (
                    <li key={i} className="text-xs text-text-2">{r.text}: <b>{r.count}</b></li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {data.failuresBySector.length > 0 && (
            <div>
              <div className="font-mono text-[0.6rem] text-text-3 uppercase mb-2">Failures By Sector</div>
              <div className="flex flex-wrap gap-2">
                {data.failuresBySector.map((s: any) => (
                  <span key={s.sector} className="font-mono text-[0.6rem] border border-border-custom bg-bg-2 px-2 py-1">{s.sector}: {s.count}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TimelineTab() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [timeline, setTimeline] = useState<{ date: string; totalPredictions: number; targetHit: number; stopLossHit: number; pending: number; expired: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ timeline: any[] }>(`/api/stock-learning/timeline?month=${month}&year=${year}`)
      .then((d) => setTimeline(d.timeline))
      .catch(() => setTimeline([]))
      .finally(() => setLoading(false));
  }, [month, year]);

  return (
    <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="font-mono text-[0.62rem] bg-bg border border-border-custom text-text-2 p-1.5">
          {MONTH_NAMES.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="font-mono text-[0.62rem] bg-bg border border-border-custom text-text-2 p-1.5">
          {[year - 1, year, year + 1].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <div className="font-mono text-xs text-text-3 animate-pulse text-center py-6">Loading…</div>
      ) : timeline.length === 0 ? (
        <div className="border border-border-custom bg-bg-2 p-6 text-center text-xs text-text-3 font-mono">No predictions uploaded for {MONTH_NAMES[month - 1]} {year}.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {timeline.map((t) => (
            <div key={t.date} className="border border-border-custom bg-bg-2 p-3 flex items-center justify-between flex-wrap gap-2">
              <span className="font-mono text-xs font-bold text-text-custom">{t.date}</span>
              <span className="font-mono text-[0.62rem] text-text-3">{t.totalPredictions} predictions</span>
              <span className="font-mono text-[0.62rem] text-green-custom">{t.targetHit} target hit</span>
              <span className="font-mono text-[0.62rem] text-red-custom">{t.stopLossHit} stop-loss hit</span>
              <span className="font-mono text-[0.62rem] text-amber-custom">{t.pending} pending</span>
              <span className="font-mono text-[0.62rem] text-text-4">{t.expired} expired</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
