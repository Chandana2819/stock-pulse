"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    experience: "BEGINNER",
    riskTolerance: "MODERATE",
    horizonYears: 5,
    monthlyInvestment: 5000,
    preferredMarkets: ["IN"] as string[],
    preferredAssets: ["STOCKS"] as string[],
  });

  const toggle = (key: "preferredMarkets" | "preferredAssets", value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].includes(value) ? prev[key].filter((v) => v !== value) : [...prev[key], value],
    }));
  };

  const finish = async () => {
    try {
      await api.put("/api/user/profile", { ...form, onboardingCompleted: true });
    } catch {}
    router.push("/");
  };

  const steps = [
    {
      title: "How experienced are you as an investor?",
      body: (
        <div className="flex gap-2 flex-wrap">
          {["BEGINNER", "INTERMEDIATE", "ADVANCED"].map((x) => (
            <button key={x} onClick={() => setForm({ ...form, experience: x })} className={`font-mono text-xs px-4 py-2 border ${form.experience === x ? "border-green-custom text-green-custom bg-green-dim" : "border-border-custom text-text-2"}`}>{x}</button>
          ))}
        </div>
      ),
    },
    {
      title: "What's your risk tolerance?",
      body: (
        <div className="flex gap-2 flex-wrap">
          {["CONSERVATIVE", "MODERATE", "AGGRESSIVE"].map((x) => (
            <button key={x} onClick={() => setForm({ ...form, riskTolerance: x })} className={`font-mono text-xs px-4 py-2 border ${form.riskTolerance === x ? "border-green-custom text-green-custom bg-green-dim" : "border-border-custom text-text-2"}`}>{x}</button>
          ))}
        </div>
      ),
    },
    {
      title: "Investment horizon & monthly amount",
      body: (
        <div className="flex flex-col gap-3">
          <div>
            <label className="font-mono text-[0.6rem] text-text-3 uppercase">Horizon (years)</label>
            <input type="number" value={form.horizonYears} onChange={(e) => setForm({ ...form, horizonYears: Number(e.target.value) })} className="block bg-bg-2 border border-border-custom p-2 text-xs font-mono text-text-custom outline-none w-32 mt-1" />
          </div>
          <div>
            <label className="font-mono text-[0.6rem] text-text-3 uppercase">Monthly investment ₹</label>
            <input type="number" value={form.monthlyInvestment} onChange={(e) => setForm({ ...form, monthlyInvestment: Number(e.target.value) })} className="block bg-bg-2 border border-border-custom p-2 text-xs font-mono text-text-custom outline-none w-32 mt-1" />
          </div>
        </div>
      ),
    },
    {
      title: "Preferred markets & asset classes",
      body: (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            {["IN", "US", "GLOBAL"].map((x) => (
              <button key={x} onClick={() => toggle("preferredMarkets", x)} className={`font-mono text-xs px-3 py-1.5 border ${form.preferredMarkets.includes(x) ? "border-green-custom text-green-custom bg-green-dim" : "border-border-custom text-text-2"}`}>{x}</button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            {["STOCKS", "MUTUAL_FUNDS", "ETFS", "IPO", "BONDS"].map((x) => (
              <button key={x} onClick={() => toggle("preferredAssets", x)} className={`font-mono text-xs px-3 py-1.5 border ${form.preferredAssets.includes(x) ? "border-green-custom text-green-custom bg-green-dim" : "border-border-custom text-text-2"}`}>{x.replace(/_/g, " ")}</button>
            ))}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-[calc(100vh-32px)] flex items-center justify-center p-6">
      <div className="w-full max-w-[480px] border border-border-bright bg-bg-1 p-8 flex flex-col gap-6">
        <div>
          <div className="font-mono text-[0.6rem] text-text-3">STEP {step + 1} OF {steps.length}</div>
          <h1 className="font-display text-xl text-text-custom mt-1">{steps[step].title}</h1>
        </div>
        {steps[step].body}
        <div className="flex justify-between mt-4">
          <button disabled={step === 0} onClick={() => setStep((s) => s - 1)} className="font-mono text-xs text-text-3 disabled:opacity-30">← BACK</button>
          {step < steps.length - 1 ? (
            <button onClick={() => setStep((s) => s + 1)} className="font-mono text-xs font-bold px-4 py-2 bg-green-custom text-bg border-none">NEXT →</button>
          ) : (
            <button onClick={finish} className="font-mono text-xs font-bold px-4 py-2 bg-green-custom text-bg border-none">FINISH →</button>
          )}
        </div>
      </div>
    </div>
  );
}
