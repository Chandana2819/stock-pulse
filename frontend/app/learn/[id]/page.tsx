"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../lib/api";

type Lesson = {
  id: string;
  title: string;
  level: string;
  track: string;
  summary: string;
  body: string[];
  example?: string;
  quiz: { question: string; options: string[]; correctIndex: number }[];
  related: string[];
};

export default function LessonPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    api.get<Lesson>(`/api/learning/${id}`).then((l) => {
      setLesson(l);
      setAnswers(new Array(l.quiz.length).fill(-1));
      setSubmitted(false);
    }).catch(() => setLesson(null));
  }, [id]);

  if (!lesson) return <div className="p-8 font-mono text-xs text-text-3">Loading...</div>;

  const score = lesson.quiz.length ? Math.round((answers.filter((a, i) => a === lesson.quiz[i].correctIndex).length / lesson.quiz.length) * 100) : 0;

  const submit = async () => {
    setSubmitted(true);
    try {
      await api.post(`/api/learning/${id}/complete`, { quizScore: score });
    } catch {}
  };

  return (
    <div className="max-w-[760px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-6">
      <button onClick={() => router.push("/learn")} className="font-mono text-[0.65rem] text-text-3 hover:text-text-custom self-start">← BACK TO LESSONS</button>

      <div>
        <span className="font-mono text-[0.55rem] px-2 py-0.5 border border-border-custom text-text-3">{lesson.level} · {lesson.track}</span>
        <h1 className="font-display text-3xl tracking-[0.08em] text-text-custom mt-2">{lesson.title}</h1>
      </div>

      <div className="flex flex-col gap-4 border border-border-bright bg-bg-1 p-6">
        {lesson.body.map((p, i) => (
          <p key={i} className="text-sm text-text-2 leading-relaxed">{p}</p>
        ))}
        {lesson.example && (
          <div className="p-3 border border-cyan-custom/30 bg-blue-dim">
            <div className="font-mono text-[0.55rem] text-cyan-custom uppercase mb-1">Example</div>
            <div className="text-sm text-text-2">{lesson.example}</div>
          </div>
        )}
      </div>

      {lesson.quiz.length > 0 && (
        <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-4">
          <div className="font-mono text-[0.6rem] tracking-[0.15em] text-text-3 uppercase">QUICK QUIZ</div>
          {lesson.quiz.map((q, qi) => (
            <div key={qi} className="flex flex-col gap-2">
              <div className="text-sm text-text-custom font-bold">{q.question}</div>
              {q.options.map((opt, oi) => {
                const isSelected = answers[qi] === oi;
                const isCorrect = submitted && oi === q.correctIndex;
                const isWrong = submitted && isSelected && oi !== q.correctIndex;
                return (
                  <button
                    key={oi}
                    disabled={submitted}
                    onClick={() => setAnswers((prev) => prev.map((a, i) => (i === qi ? oi : a)))}
                    className={`text-left text-xs p-2.5 border font-mono ${
                      isCorrect ? "border-green-custom bg-green-dim text-green-custom" : isWrong ? "border-red-custom bg-red-dim text-red-custom" : isSelected ? "border-cyan-custom text-text-custom" : "border-border-custom text-text-2"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          ))}
          {!submitted ? (
            <button onClick={submit} disabled={answers.includes(-1)} className="font-mono text-xs font-bold py-2 bg-green-custom text-bg border-none disabled:opacity-40">SUBMIT QUIZ</button>
          ) : (
            <div className="font-mono text-sm text-text-custom">Score: {score}% — {score === 100 ? "Great work!" : "Review the explanation above and try again anytime."}</div>
          )}
        </div>
      )}

      {lesson.related.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {lesson.related.map((r) => (
            <Link key={r} href={`/learn/${r}`} className="font-mono text-[0.6rem] px-2.5 py-1 border border-border-custom text-text-3 hover:border-green-custom hover:text-green-custom no-underline">
              {r.replace(/-/g, " ")}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
