"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { api, ApiRequestError } from "../lib/api";

type Msg = { role: "user" | "assistant"; text: string; confidence?: number; symbol?: string | null };

const SUGGESTIONS = [
  "Why is TCS falling?",
  "Should I add more Infosys?",
  "Compare TCS vs Infosys",
  "How much am I exposed to IT?",
  "What are my biggest risks?",
  "Explain PE ratio",
  "Create a ₹10,000 diversified portfolio",
  "Why did my portfolio fall today?",
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: "Ask me about a stock's move, whether to buy/hold, your portfolio's risk and exposure, or any investing concept. I answer using your real app data — not generic chat." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastSymbol, setLastSymbol] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setLoading(true);
    try {
      const res = await api.post<{ answer: string; confidence: number; symbol?: string | null }>("/api/ai/chat", {
        question: text,
        contextSymbol: lastSymbol ?? undefined,
      });
      setMessages((prev) => [...prev, { role: "assistant", text: res.answer, confidence: res.confidence, symbol: res.symbol ?? null }]);
      if (res.symbol) setLastSymbol(res.symbol);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", text: e instanceof ApiRequestError ? e.message : "Something went wrong answering that." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[820px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-4 h-[calc(100vh-90px)]">
      <div>
        <h1 className="font-display text-2xl tracking-[0.1em] text-text-custom">AI INVESTMENT ASSISTANT</h1>
        <p className="font-mono text-[0.65rem] text-text-3 mt-1">Answers are grounded in your portfolio, watchlist, and the app's own decision engine — never generic chit-chat.</p>
      </div>

      <div className="flex-1 overflow-y-auto border border-border-bright bg-bg-1 p-5 flex flex-col gap-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] p-3 text-sm leading-relaxed ${m.role === "user" ? "bg-green-dim border border-green-custom/30 text-text-custom" : "bg-bg-2 border border-border-custom text-text-2"}`}>
              {m.text}
              {(m.confidence != null || m.symbol) && (
                <div className="flex items-center justify-between gap-3 mt-2">
                  {m.confidence != null && <div className="font-mono text-[0.55rem] text-text-3 uppercase">Confidence: {m.confidence}%</div>}
                  {m.symbol && (
                    <Link
                      href={`/stock/${encodeURIComponent(m.symbol)}`}
                      className="font-mono text-[0.55rem] text-cyan-custom hover:underline uppercase whitespace-nowrap"
                    >
                      View chart & full analysis →
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {lastSymbol && (
          <div className="font-mono text-[0.55rem] text-text-4 uppercase self-start">
            Still talking about {lastSymbol} — mention another stock to switch.
          </div>
        )}
        {loading && <div className="font-mono text-[0.65rem] text-text-3 animate-pulse">Thinking…</div>}
        <div ref={endRef} />
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)} className="font-mono text-[0.6rem] px-2.5 py-1 border border-border-custom text-text-3 hover:border-green-custom hover:text-green-custom">
            {s}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Ask about a stock, your portfolio, or an investing concept..."
          className="flex-1 bg-bg-2 border border-border-bright p-3 text-sm font-mono text-text-custom outline-none focus:border-green-custom"
        />
        <button onClick={() => send(input)} disabled={loading} className="font-mono text-xs font-bold px-5 bg-green-custom text-bg border-none cursor-pointer disabled:opacity-50">
          SEND →
        </button>
      </div>
    </div>
  );
}
