"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";

type Lesson = {
  id: string;
  title: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  track: string;
  summary: string;
  body: string[];
  example?: string;
  quiz?: any[];
};

export default function LearningContentPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Lesson Form
  const [formOpen, setFormOpen] = useState(false);
  const [lessonId, setLessonId] = useState("");
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState<"BEGINNER" | "INTERMEDIATE" | "ADVANCED">("BEGINNER");
  const [track, setTrack] = useState("");
  const [summary, setSummary] = useState("");
  const [bodyPara1, setBodyPara1] = useState("");
  const [bodyPara2, setBodyPara2] = useState("");
  const [example, setExample] = useState("");

  const fetchLessons = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<Lesson[]>("/api/admin/learning");
      setLessons(res);
    } catch (err: any) {
      setError(err.message || "Failed to load educational tracks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLessons();
  }, [fetchLessons]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonId.trim() || !title.trim() || !track.trim() || !summary.trim() || !bodyPara1.trim()) {
      alert("Please fill in all required fields");
      return;
    }

    const payload = {
      id: lessonId.trim().toLowerCase().replace(/\s+/g, "-"),
      title: title.trim(),
      level,
      track: track.trim(),
      summary: summary.trim(),
      body: [bodyPara1.trim(), bodyPara2.trim()].filter(Boolean),
      example: example.trim() || undefined,
      quiz: [],
    };

    try {
      await api.post("/api/admin/learning", payload);
      alert("Lesson published successfully!");
      setFormOpen(false);
      
      // Clear form
      setLessonId("");
      setTitle("");
      setTrack("");
      setSummary("");
      setBodyPara1("");
      setBodyPara2("");
      setExample("");
      
      fetchLessons();
    } catch (err: any) {
      alert(err.message || "Failed to publish learning content");
    }
  };

  return (
    <div className="p-6 sm:p-8 flex flex-col gap-6 animate-card-enter">
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-border-custom pb-4 gap-3">
        <div>
          <h1 className="font-display text-xl tracking-[0.1em] text-red-custom uppercase">
            CMS content publisher
          </h1>
          <p className="font-mono text-[0.65rem] text-text-3 mt-1 uppercase">
            Create educational investor articles, compile guides, and track tracks
          </p>
        </div>
        <button
          onClick={() => setFormOpen(!formOpen)}
          className="px-4 py-2 border border-red-custom bg-red-custom text-bg font-mono text-xs font-bold uppercase rounded cursor-pointer transition-all hover:bg-opacity-90"
        >
          {formOpen ? "Close Publisher" : "Add Lesson Article"}
        </button>
      </div>

      {error && (
        <div className="border border-red-custom/40 bg-red-dim/15 p-4 font-mono text-xs text-red-custom uppercase rounded">
          ⚠️ {error}
        </div>
      )}

      {/* Publisher Form Modal */}
      {formOpen && (
        <form onSubmit={handleSubmit} className="border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-4 font-mono text-xs max-w-xl">
          <h3 className="text-xs font-bold text-text-custom uppercase border-b border-border-custom pb-2">Publish Article Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-text-3 uppercase text-[0.62rem]">Lesson ID (Unique URL Slug):</label>
              <input
                type="text"
                placeholder="e.g. advanced-hedging"
                value={lessonId}
                onChange={(e) => setLessonId(e.target.value)}
                required
                className="bg-bg border border-border-custom text-text-custom p-2 focus:outline-none placeholder:text-text-4"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-text-3 uppercase text-[0.62rem]">Article Title:</label>
              <input
                type="text"
                placeholder="e.g. Options Hedging Strategies"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="bg-bg border border-border-custom text-text-custom p-2 focus:outline-none placeholder:text-text-4"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-text-3 uppercase text-[0.62rem]">Subject Track:</label>
              <input
                type="text"
                placeholder="e.g. Options / Advanced"
                value={track}
                onChange={(e) => setTrack(e.target.value)}
                required
                className="bg-bg border border-border-custom text-text-custom p-2 focus:outline-none placeholder:text-text-4"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-text-3 uppercase text-[0.62rem]">Target Skill Level:</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as any)}
                className="bg-bg border border-border-custom text-text-custom p-2 focus:outline-none"
              >
                <option value="BEGINNER">BEGINNER</option>
                <option value="INTERMEDIATE">INTERMEDIATE</option>
                <option value="ADVANCED">ADVANCED</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-text-3 uppercase text-[0.62rem]">Short summary:</label>
            <input
              type="text"
              placeholder="Provide a brief summary paragraph..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              required
              className="bg-bg border border-border-custom text-text-custom p-2 focus:outline-none placeholder:text-text-4"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-text-3 uppercase text-[0.62rem]">Paragraph 1 (Body):</label>
            <textarea
              rows={3}
              placeholder="First body paragraph..."
              value={bodyPara1}
              onChange={(e) => setBodyPara1(e.target.value)}
              required
              className="bg-bg border border-border-custom text-text-custom p-2 focus:outline-none placeholder:text-text-4"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-text-3 uppercase text-[0.62rem]">Paragraph 2 (Body - Optional):</label>
            <textarea
              rows={3}
              placeholder="Second body paragraph..."
              value={bodyPara2}
              onChange={(e) => setBodyPara2(e.target.value)}
              className="bg-bg border border-border-custom text-text-custom p-2 focus:outline-none placeholder:text-text-4"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-text-3 uppercase text-[0.62rem]">Example Case Study (Optional):</label>
            <input
              type="text"
              placeholder="e.g. If you buy a call option at strike price..."
              value={example}
              onChange={(e) => setExample(e.target.value)}
              className="bg-bg border border-border-custom text-text-custom p-2 focus:outline-none placeholder:text-text-4"
            />
          </div>

          <div className="flex justify-end mt-2">
            <button
              type="submit"
              className="px-6 py-2 bg-red-custom text-bg border-none font-bold uppercase transition-all duration-150 cursor-pointer hover:bg-opacity-90"
            >
              Publish Article
            </button>
          </div>
        </form>
      )}

      {/* Lessons List Grid */}
      <div className="border border-border-custom bg-bg-1 rounded overflow-hidden">
        {loading ? (
          <div className="p-8 text-center font-mono text-xs text-text-3 animate-pulse">
            LOADING EDUCATIONAL CONTENTS...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-border-custom bg-bg-2 text-text-2 uppercase text-[0.62rem] tracking-wider">
                  <th className="p-3">Track</th>
                  <th className="p-3">Slug ID</th>
                  <th className="p-3">Article Title</th>
                  <th className="p-3 text-center">Skill Level</th>
                  <th className="p-3 text-right">Quiz count</th>
                </tr>
              </thead>
              <tbody>
                {lessons.map((l) => (
                  <tr key={l.id} className="border-b border-border-custom/50 hover:bg-bg-2/30">
                    <td className="p-3 font-bold text-text-custom uppercase">{l.track}</td>
                    <td className="p-3 text-text-2">{l.id}</td>
                    <td className="p-3 text-text-custom font-semibold">{l.title}</td>
                    <td className="p-3 text-center">
                      <span className={`px-1.5 py-0.2 rounded-sm text-[0.58rem] font-bold ${
                        l.level === "BEGINNER" ? "bg-green-dim text-green-custom" :
                        l.level === "INTERMEDIATE" ? "bg-amber-dim text-amber-custom" : "bg-red-dim text-red-custom"
                      }`}>{l.level}</span>
                    </td>
                    <td className="p-3 text-right text-text-3 font-bold">{l.quiz?.length || 0} questions</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
