"use client";

import { useEffect, useState, useCallback } from "react";
import { api, ApiRequestError } from "../lib/api";

type Goal = {
  id: string;
  name: string;
  category: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  monthlyContribution: number;
  expectedReturn: number;
  projection: {
    years: number;
    progressPct: number;
    requiredMonthlyInvestment: number | null;
    projectedAtCurrentContribution: number;
    onTrack: boolean | null;
    scenarios: { bear: number; base: number; bull: number };
  };
};

const CATEGORIES = ["EMERGENCY", "CAR", "HOUSE", "EDUCATION", "RETIREMENT", "VACATION", "WEALTH"];

function fmtInr(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", category: "WEALTH", targetAmount: "", currentAmount: "0", targetDate: "", monthlyContribution: "", expectedReturn: "12" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Goal[]>("/api/goals");
      setGoals(data);
    } catch {
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createGoal = async () => {
    setError(null);
    try {
      await api.post("/api/goals", {
        name: form.name,
        category: form.category,
        targetAmount: Number(form.targetAmount),
        currentAmount: Number(form.currentAmount || 0),
        targetDate: form.targetDate,
        monthlyContribution: Number(form.monthlyContribution || 0),
        expectedReturn: Number(form.expectedReturn || 12),
      });
      setShowForm(false);
      setForm({ name: "", category: "WEALTH", targetAmount: "", currentAmount: "0", targetDate: "", monthlyContribution: "", expectedReturn: "12" });
      load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Failed to create goal");
    }
  };

  const deleteGoal = async (id: string) => {
    await api.del(`/api/goals/${id}`);
    load();
  };

  return (
    <div className="max-w-[1000px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-[0.1em] text-text-custom">INVESTMENT GOALS</h1>
          <p className="font-mono text-[0.65rem] text-text-3 mt-1">Set a target, and see what it takes to get there — never a guaranteed number.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="font-mono text-xs font-bold px-4 py-2 bg-green-custom text-bg border-none cursor-pointer">
          {showForm ? "CANCEL" : "+ NEW GOAL"}
        </button>
      </div>

      {showForm && (
        <div className="border border-border-bright bg-bg-1 p-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input placeholder="Goal name (e.g. House down payment)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-bg-2 border border-border-custom p-2 text-xs font-mono text-text-custom outline-none sm:col-span-3" />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="bg-bg-2 border border-border-custom p-2 text-xs font-mono text-text-custom outline-none">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input type="number" placeholder="Target amount ₹" value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} className="bg-bg-2 border border-border-custom p-2 text-xs font-mono text-text-custom outline-none" />
          <input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} className="bg-bg-2 border border-border-custom p-2 text-xs font-mono text-text-custom outline-none" />
          <input type="number" placeholder="Current savings ₹" value={form.currentAmount} onChange={(e) => setForm({ ...form, currentAmount: e.target.value })} className="bg-bg-2 border border-border-custom p-2 text-xs font-mono text-text-custom outline-none" />
          <input type="number" placeholder="Monthly contribution ₹" value={form.monthlyContribution} onChange={(e) => setForm({ ...form, monthlyContribution: e.target.value })} className="bg-bg-2 border border-border-custom p-2 text-xs font-mono text-text-custom outline-none" />
          <input type="number" placeholder="Expected return % p.a." value={form.expectedReturn} onChange={(e) => setForm({ ...form, expectedReturn: e.target.value })} className="bg-bg-2 border border-border-custom p-2 text-xs font-mono text-text-custom outline-none" />
          {error && <div className="sm:col-span-3 text-red-custom font-mono text-xs">{error}</div>}
          <button onClick={createGoal} className="sm:col-span-3 font-mono text-xs font-bold py-2 bg-green-custom text-bg border-none cursor-pointer">CREATE GOAL</button>
        </div>
      )}

      {loading ? (
        <div className="font-mono text-xs text-text-3">Loading...</div>
      ) : goals.length === 0 ? (
        <div className="border border-border-custom bg-bg-1 p-10 text-center font-mono text-xs text-text-3">No goals yet. Create one to see a required-SIP projection.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {goals.map((g) => (
            <div key={g.id} className="border border-border-bright bg-bg-1 p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-display text-lg text-text-custom">{g.name}</div>
                  <div className="font-mono text-[0.58rem] text-text-3 uppercase tracking-wide">{g.category} · target {new Date(g.targetDate).toLocaleDateString("en-IN")}</div>
                </div>
                <button onClick={() => deleteGoal(g.id)} className="text-text-3 hover:text-red-custom text-xs">✕</button>
              </div>

              <div className="h-2 bg-bg-3 rounded overflow-hidden">
                <div className="h-full bg-green-custom" style={{ width: `${g.projection.progressPct}%` }} />
              </div>
              <div className="font-mono text-[0.65rem] text-text-2">
                {fmtInr(g.currentAmount)} of {fmtInr(g.targetAmount)} ({g.projection.progressPct.toFixed(1)}%)
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 border border-border-custom bg-bg-2">
                  <div className="text-text-3 text-[0.55rem] uppercase">Required Monthly SIP</div>
                  <div className="text-text-custom font-bold">{g.projection.requiredMonthlyInvestment != null ? fmtInr(g.projection.requiredMonthlyInvestment) : "—"}</div>
                </div>
                <div className="p-2 border border-border-custom bg-bg-2">
                  <div className="text-text-3 text-[0.55rem] uppercase">On Track</div>
                  <div className={`font-bold ${g.projection.onTrack ? "text-green-custom" : "text-amber-custom"}`}>{g.projection.onTrack == null ? "—" : g.projection.onTrack ? "YES" : "NOT YET"}</div>
                </div>
              </div>

              <div>
                <div className="font-mono text-[0.55rem] text-text-3 uppercase mb-1">Scenario range at current contribution</div>
                <div className="grid grid-cols-3 gap-2 text-[0.65rem] font-mono">
                  <div className="p-2 bg-red-dim border border-red-custom/30 text-center"><div className="text-text-3 text-[0.5rem]">BEAR</div><div className="text-text-custom">{fmtInr(g.projection.scenarios.bear)}</div></div>
                  <div className="p-2 bg-blue-dim border border-blue-custom/30 text-center"><div className="text-text-3 text-[0.5rem]">BASE</div><div className="text-text-custom">{fmtInr(g.projection.scenarios.base)}</div></div>
                  <div className="p-2 bg-green-dim border border-green-custom/30 text-center"><div className="text-text-3 text-[0.5rem]">BULL</div><div className="text-text-custom">{fmtInr(g.projection.scenarios.bull)}</div></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
