"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api";

type Lesson = { id: string; title: string; level: string; track: string; summary: string; status: string };

const LEVEL_COLOR: Record<string, string> = { BEGINNER: "text-green-custom border-green-custom", INTERMEDIATE: "text-amber-custom border-amber-custom", ADVANCED: "text-red-custom border-red-custom" };

export default function LearnPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [level, setLevel] = useState<string>("");

  useEffect(() => {
    api.get<{ lessons: Lesson[] }>(`/api/learning${level ? `?level=${level}` : ""}`).then((d) => setLessons(d.lessons)).catch(() => setLessons([]));
  }, [level]);

  return (
    <div className="max-w-[1000px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl tracking-[0.1em] text-text-custom">INVESTOR LEARNING</h1>
        <p className="font-mono text-[0.65rem] text-text-3 mt-1">Beginner → Intermediate → Advanced. Each lesson ends with a quick quiz.</p>
      </div>

      <div className="flex gap-2">
        {["", "BEGINNER", "INTERMEDIATE", "ADVANCED"].map((l) => (
          <button key={l} onClick={() => setLevel(l)} className={`font-mono text-[0.65rem] px-3 py-1.5 border ${level === l ? "border-green-custom text-green-custom bg-green-dim" : "border-border-custom text-text-3"}`}>
            {l || "ALL"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {lessons.map((l) => (
          <Link key={l.id} href={`/learn/${l.id}`} className="no-underline border border-border-bright bg-bg-1 p-5 flex flex-col gap-2 hover:border-green-custom transition-colors">
            <div className="flex items-center justify-between">
              <span className={`font-mono text-[0.55rem] px-2 py-0.5 border ${LEVEL_COLOR[l.level] ?? ""}`}>{l.level}</span>
              {l.status === "COMPLETED" && <span className="font-mono text-[0.55rem] text-green-custom">✓ DONE</span>}
            </div>
            <div className="font-display text-lg text-text-custom">{l.title}</div>
            <div className="font-mono text-[0.58rem] text-text-3 uppercase">{l.track}</div>
            <div className="text-xs text-text-2 leading-relaxed">{l.summary}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
