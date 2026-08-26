"use client";

import { useEffect, useState, useCallback } from "react";
import NotificationSystem, { Toast } from "../components/NotificationSystem";
import { API_BASE } from "../lib/api";

type JournalEntry = {
  id: string;
  stock: string;
  thesis: string;
  status: "OPEN" | "CLOSED";
  notes?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
};

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Form states (Create entry)
  const [formStock, setFormStock] = useState("");
  const [formThesis, setFormThesis] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Close out state
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closeNotes, setCloseNotes] = useState("");
  const [closingSubmitting, setClosingSubmitting] = useState(false);

  const addToast = useCallback((toast: Omit<Toast, "id" | "timestamp">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-3), { ...toast, id, timestamp: Date.now() }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const fetchEntries = useCallback(async () => {
    const deviceId = localStorage.getItem("sp_device_id");
    if (!deviceId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/journal`, {
        headers: { "x-device-id": deviceId },
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(data || []);
      }
    } catch {
      addToast({ type: "danger", title: "Error", message: "Failed to fetch journal entries." });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Handle entry creation
  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formStock.trim() || !formThesis.trim()) return;

    const deviceId = localStorage.getItem("sp_device_id");
    if (!deviceId) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/journal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        },
        body: JSON.stringify({
          stock: formStock.toUpperCase().trim(),
          thesis: formThesis,
        }),
      });

      if (res.ok) {
        addToast({ type: "success", title: "Thesis Logged", message: `Recorded investment thesis for ${formStock.toUpperCase()}.` });
        setFormStock("");
        setFormThesis("");
        fetchEntries();
      } else {
        const err = await res.json();
        addToast({ type: "danger", title: "Submission Failed", message: err.error || "Could not log entry." });
      }
    } catch {
      addToast({ type: "danger", title: "Error", message: "Network error submitting thesis." });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle entry close out submission
  const handleCloseEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingId || !closeNotes.trim()) return;

    const deviceId = localStorage.getItem("sp_device_id");
    if (!deviceId) return;

    setClosingSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/journal`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        },
        body: JSON.stringify({
          id: closingId,
          status: "CLOSED",
          notes: closeNotes,
        }),
      });

      if (res.ok) {
        addToast({ type: "info", title: "Thesis Archived", message: "Thesis successfully closed out." });
        setClosingId(null);
        setCloseNotes("");
        fetchEntries();
      } else {
        const err = await res.json();
        addToast({ type: "danger", title: "Close failed", message: err.error || "Wipe failed." });
      }
    } catch {
      addToast({ type: "danger", title: "Error", message: "Network error closing thesis." });
    } finally {
      setClosingSubmitting(false);
    }
  };

  const openEntries = entries.filter((e) => e.status === "OPEN");
  const closedEntries = entries.filter((e) => e.status === "CLOSED");

  return (
    <div className="grid grid-rows-[auto_1fr_auto] min-h-[calc(100vh-32px)] pt-4">
      <main className="grid grid-cols-1 lg:grid-cols-[1fr_360px] max-w-[1100px] mx-auto w-full p-4 sm:p-8 gap-4 sm:gap-8">
        
        {/* Left Column: Logged Theses */}
        <div>
          <section className="flex flex-col gap-5 mt-0">
            <div className="font-mono text-[0.62rem] tracking-[0.15em] text-text-3 uppercase">{"// ACTIVE INVESTMENT THESES (OPEN)"}</div>
            
            {loading ? (
              <div className="font-mono text-xs text-text-3 py-8 text-center">LOADING JOURNAL ENTRIES...</div>
            ) : openEntries.length === 0 ? (
              <div className="border border-dashed border-border-custom p-12 text-center rounded my-4">
                <div className="font-display text-[1.2rem] tracking-[0.1em] text-text-3">NO ACTIVE THESES</div>
                <div className="font-mono text-xs text-text-3 mt-2">DOCUMENT YOUR THINKING BEFORE EXECUTING A TRANSACTION</div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 my-4">
                {openEntries.map((item) => (
                  <div
                    key={item.id}
                    className="bg-bg-1 border border-green-custom rounded-lg p-5 shadow-[0_0_20px_rgba(0,229,160,0.15)] animate-card-enter"
                  >
                    <div className="flex justify-between items-center border-b border-border-custom pb-2 mb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-display text-[1.5rem] font-bold text-text-custom tracking-wider">{item.stock}</span>
                        <span className="font-mono text-[0.6rem] bg-green-dim text-green-custom px-[0.4rem] py-[0.1rem] rounded-sm">THESIS ACTIVE</span>
                      </div>
                      <span className="font-mono text-[0.65rem] text-text-3">
                        LOGGED: {new Date(item.createdAt).toLocaleDateString("en-IN")}
                      </span>
                    </div>
                    
                    <p className="text-[0.85rem] text-text-custom leading-relaxed font-body whitespace-pre-wrap">
                      {item.thesis}
                    </p>

                    {closingId === item.id ? (
                      <form onSubmit={handleCloseEntry} className="mt-4 border-t border-dashed border-border-custom pt-4">
                        <label className="block font-mono text-[0.65rem] text-text-2 mb-1">POST-TRADE EVALUATION / RESOLUTION NOTES</label>
                        <textarea
                          placeholder="e.g. Closed position at 15% profit as target hit, or sold at loss due to support breach. Lessons learned..."
                          value={closeNotes}
                          onChange={(e) => setCloseNotes(e.target.value)}
                          rows={3}
                          className="w-full bg-bg border border-border-custom rounded p-2 text-text-custom font-mono text-xs outline-none focus:border-green-custom resize-y mb-2"
                          required
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => setClosingId(null)}
                            className="bg-transparent border border-border-custom text-text-2 font-mono text-[0.65rem] py-1 px-3 cursor-pointer rounded transition-colors hover:bg-bg-2"
                          >
                            CANCEL
                          </button>
                          <button
                            type="submit"
                            disabled={closingSubmitting}
                            className="bg-blue-custom border-none text-bg font-mono text-[0.65rem] font-bold py-1 px-3 cursor-pointer rounded transition-opacity hover:opacity-90 disabled:opacity-40"
                          >
                            {closingSubmitting ? "CLOSING..." : "COMMIT RESOLUTION"}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex justify-end mt-4">
                        <button
                          onClick={() => {
                            setClosingId(item.id);
                            setCloseNotes("");
                          }}
                          className="font-mono text-[0.65rem] bg-transparent border border-blue-custom text-blue-custom py-1 px-3 rounded cursor-pointer transition-colors hover:bg-blue-dim"
                        >
                          CLOSE OUT POSITION / ARCHIVE THESIS →
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Archived Theses */}
            <div className="font-mono text-[0.62rem] tracking-[0.15em] text-text-3 uppercase mt-12">{"// ARCHIVED RESOLUTIONS (CLOSED)"}</div>
            {closedEntries.length === 0 ? (
              <div className="font-mono text-xs text-text-3 py-4">NO ARCHIVED ENTRIES</div>
            ) : (
              <div className="flex flex-col gap-4 my-4">
                {closedEntries.map((item) => (
                  <div
                    key={item.id}
                    className="bg-bg-1 border border-border-custom rounded-lg p-5"
                  >
                    <div className="flex justify-between items-center border-b border-border-custom pb-2 mb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-display text-[1.4rem] font-bold text-text-2 tracking-wider">{item.stock}</span>
                        <span className="font-mono text-[0.6rem] border border-text-3 text-text-3 px-[0.4rem] py-[0.1rem] rounded-sm">RESOLVED</span>
                      </div>
                      <span className="font-mono text-[0.65rem] text-text-3">
                        CLOSED: {item.closedAt ? new Date(item.closedAt).toLocaleDateString("en-IN") : "--"}
                      </span>
                    </div>

                    <div className="mb-4">
                      <div className="font-mono text-[0.6rem] text-text-3 mb-1">INITIAL THESIS:</div>
                      <p className="text-[0.8rem] text-text-2 font-body leading-relaxed whitespace-pre-wrap">
                        {item.thesis}
                      </p>
                    </div>

                    <div className="border-l-2 border-l-blue-custom pl-4 bg-blue-dim/5 py-2 rounded-r-sm">
                      <div className="font-mono text-[0.6rem] text-blue-custom font-bold mb-1">RESOLUTION OUTCOME:</div>
                      <p className="text-[0.8rem] text-text-custom font-mono leading-relaxed whitespace-pre-wrap">
                        {item.notes}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Record Form */}
        <div>
          <section className="bg-bg-1 border border-border-custom p-6 rounded flex flex-col gap-5">
            <div className="font-mono text-[0.62rem] tracking-[0.15em] text-text-3 uppercase">{"// LOG NEW THESIS"}</div>
            <form onSubmit={handleCreateEntry} className="mt-4">
              <div className="mb-4">
                <label className="block font-mono text-[0.65rem] text-text-3 mb-1">STOCK SYMBOL (e.g. TCS or NVDA)</label>
                <input
                  type="text"
                  placeholder="SYMBOL"
                  value={formStock}
                  onChange={(e) => setFormStock(e.target.value)}
                  className="w-full bg-bg border border-border-custom rounded p-2 text-text-custom font-mono text-xs outline-none focus:border-green-custom"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block font-mono text-[0.65rem] text-text-3 mb-1">INVESTMENT THESIS / ANALYSIS LOG</label>
                <textarea
                  placeholder="Why are you buying/selling this stock? What indicators support your action? What is your entry target, stop loss, and exit target?"
                  value={formThesis}
                  onChange={(e) => setFormThesis(e.target.value)}
                  rows={8}
                  className="w-full bg-bg border border-border-custom rounded p-2 text-text-custom font-mono text-xs outline-none focus:border-green-custom resize-y"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full font-mono text-xs font-bold bg-green-custom text-bg border-none p-3 rounded cursor-pointer tracking-wider uppercase transition-colors hover:bg-green-custom/90 disabled:opacity-40"
              >
                {submitting ? "SUBMITTING LOG..." : "SAVE THESIS TO JOURNAL →"}
              </button>
            </form>
          </section>
        </div>

      </main>

      {/* ── Footer ── */}
      <footer className="flex items-center justify-between p-[0.75rem_2rem] border-t border-border-custom bg-bg-1">
        <div className="font-mono text-[0.62rem] text-text-3 tracking-[0.05em]">
          STOCKPULSE · JOURNAL FEED ACTIVE · RECORD THESES BEFORE ACTION
        </div>
        <div className="flex items-center gap-3 font-mono text-[0.6rem] text-text-4">
          <span>© 2026</span>
        </div>
      </footer>

      {/* Toasts */}
      <NotificationSystem toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
