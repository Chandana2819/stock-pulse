"use client";

import { useState } from "react";
import { api } from "../lib/api";

function Field({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-mono text-[0.55rem] text-text-3 uppercase tracking-wide">{label}{suffix ? ` (${suffix})` : ""}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="bg-bg-2 border border-border-custom p-2 text-xs font-mono text-text-custom outline-none focus:border-green-custom" />
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between font-mono text-xs py-1.5 border-b border-border-custom last:border-0">
      <span className="text-text-3">{label}</span>
      <span className="text-text-custom font-bold">{value}</span>
    </div>
  );
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function CalculatorsPage() {
  const [tab, setTab] = useState<"SIP" | "LUMPSUM" | "RETIREMENT" | "GOAL">("SIP");

  const [sip, setSip] = useState({ monthly: "10000", annualReturn: "12", years: "15", stepUpPct: "0" });
  const [sipResult, setSipResult] = useState<{ futureValue: number; invested: number; gain: number } | null>(null);

  const [lumpsum, setLumpsum] = useState({ amount: "100000", annualReturn: "12", years: "15" });
  const [lumpsumResult, setLumpsumResult] = useState<{ futureValue: number; invested: number; gain: number } | null>(null);

  const [retire, setRetire] = useState({ currentAge: "30", retireAge: "60", monthlyExpenseToday: "50000", inflationPct: "6", postRetirementReturnPct: "7", preRetirementReturnPct: "12" });
  const [retireResult, setRetireResult] = useState<{ corpusNeeded: number; requiredMonthlySip: number | null; monthlyExpenseAtRetirement: number } | null>(null);

  const [goal, setGoal] = useState({ target: "2000000", annualReturn: "12", years: "5" });
  const [goalResult, setGoalResult] = useState<{ requiredMonthlySip: number | null } | null>(null);

  const calcSip = async () => setSipResult(await api.get(`/api/calculators/sip?monthly=${sip.monthly}&annualReturn=${sip.annualReturn}&years=${sip.years}&stepUpPct=${sip.stepUpPct}`));
  const calcLumpsum = async () => setLumpsumResult(await api.get(`/api/calculators/lumpsum?amount=${lumpsum.amount}&annualReturn=${lumpsum.annualReturn}&years=${lumpsum.years}`));
  const calcRetire = async () => setRetireResult(await api.get(`/api/calculators/retirement?currentAge=${retire.currentAge}&retireAge=${retire.retireAge}&monthlyExpenseToday=${retire.monthlyExpenseToday}&inflationPct=${retire.inflationPct}&postRetirementReturnPct=${retire.postRetirementReturnPct}&preRetirementReturnPct=${retire.preRetirementReturnPct}`));
  const calcGoal = async () => setGoalResult(await api.get(`/api/calculators/required-sip?target=${goal.target}&annualReturn=${goal.annualReturn}&years=${goal.years}`));

  return (
    <div className="max-w-[700px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl tracking-[0.1em] text-text-custom">INVESTMENT CALCULATORS</h1>
        <p className="font-mono text-[0.65rem] text-text-3 mt-1">All results are illustrative estimates based on the return you assume — never a guarantee.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["SIP", "LUMPSUM", "RETIREMENT", "GOAL"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`font-mono text-[0.65rem] px-3 py-1.5 border ${tab === t ? "border-green-custom text-green-custom bg-green-dim" : "border-border-custom text-text-3"}`}>{t}</button>
        ))}
      </div>

      {tab === "SIP" && (
        <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monthly Investment" suffix="₹" value={sip.monthly} onChange={(v) => setSip({ ...sip, monthly: v })} />
            <Field label="Expected Return" suffix="% p.a." value={sip.annualReturn} onChange={(v) => setSip({ ...sip, annualReturn: v })} />
            <Field label="Duration" suffix="years" value={sip.years} onChange={(v) => setSip({ ...sip, years: v })} />
            <Field label="Annual Step-up" suffix="%" value={sip.stepUpPct} onChange={(v) => setSip({ ...sip, stepUpPct: v })} />
          </div>
          <button onClick={calcSip} className="font-mono text-xs font-bold py-2 bg-green-custom text-bg border-none cursor-pointer">CALCULATE</button>
          {sipResult && (
            <div className="border-t border-border-custom pt-3">
              <ResultRow label="Total Invested" value={inr(sipResult.invested)} />
              <ResultRow label="Estimated Gain" value={inr(sipResult.gain)} />
              <ResultRow label="Future Value" value={inr(sipResult.futureValue)} />
            </div>
          )}
        </div>
      )}

      {tab === "LUMPSUM" && (
        <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" suffix="₹" value={lumpsum.amount} onChange={(v) => setLumpsum({ ...lumpsum, amount: v })} />
            <Field label="Expected Return" suffix="% p.a." value={lumpsum.annualReturn} onChange={(v) => setLumpsum({ ...lumpsum, annualReturn: v })} />
            <Field label="Duration" suffix="years" value={lumpsum.years} onChange={(v) => setLumpsum({ ...lumpsum, years: v })} />
          </div>
          <button onClick={calcLumpsum} className="font-mono text-xs font-bold py-2 bg-green-custom text-bg border-none cursor-pointer">CALCULATE</button>
          {lumpsumResult && (
            <div className="border-t border-border-custom pt-3">
              <ResultRow label="Invested" value={inr(lumpsumResult.invested)} />
              <ResultRow label="Estimated Gain" value={inr(lumpsumResult.gain)} />
              <ResultRow label="Future Value" value={inr(lumpsumResult.futureValue)} />
            </div>
          )}
        </div>
      )}

      {tab === "RETIREMENT" && (
        <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Current Age" value={retire.currentAge} onChange={(v) => setRetire({ ...retire, currentAge: v })} />
            <Field label="Retirement Age" value={retire.retireAge} onChange={(v) => setRetire({ ...retire, retireAge: v })} />
            <Field label="Monthly Expense Today" suffix="₹" value={retire.monthlyExpenseToday} onChange={(v) => setRetire({ ...retire, monthlyExpenseToday: v })} />
            <Field label="Inflation" suffix="%" value={retire.inflationPct} onChange={(v) => setRetire({ ...retire, inflationPct: v })} />
            <Field label="Pre-retirement Return" suffix="%" value={retire.preRetirementReturnPct} onChange={(v) => setRetire({ ...retire, preRetirementReturnPct: v })} />
            <Field label="Post-retirement Return" suffix="%" value={retire.postRetirementReturnPct} onChange={(v) => setRetire({ ...retire, postRetirementReturnPct: v })} />
          </div>
          <button onClick={calcRetire} className="font-mono text-xs font-bold py-2 bg-green-custom text-bg border-none cursor-pointer">CALCULATE</button>
          {retireResult && (
            <div className="border-t border-border-custom pt-3">
              <ResultRow label="Monthly Expense at Retirement" value={inr(retireResult.monthlyExpenseAtRetirement)} />
              <ResultRow label="Corpus Needed" value={inr(retireResult.corpusNeeded)} />
              <ResultRow label="Required Monthly SIP" value={retireResult.requiredMonthlySip != null ? inr(retireResult.requiredMonthlySip) : "—"} />
            </div>
          )}
        </div>
      )}

      {tab === "GOAL" && (
        <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target Amount" suffix="₹" value={goal.target} onChange={(v) => setGoal({ ...goal, target: v })} />
            <Field label="Expected Return" suffix="% p.a." value={goal.annualReturn} onChange={(v) => setGoal({ ...goal, annualReturn: v })} />
            <Field label="Time to Goal" suffix="years" value={goal.years} onChange={(v) => setGoal({ ...goal, years: v })} />
          </div>
          <button onClick={calcGoal} className="font-mono text-xs font-bold py-2 bg-green-custom text-bg border-none cursor-pointer">CALCULATE</button>
          {goalResult && (
            <div className="border-t border-border-custom pt-3">
              <ResultRow label="Required Monthly SIP" value={goalResult.requiredMonthlySip != null ? inr(goalResult.requiredMonthlySip) : "—"} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
