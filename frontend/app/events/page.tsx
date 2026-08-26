"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import Link from "next/link";

type MarketEvent = {
  id: string;
  type: string;
  title: string;
  symbol: string | null;
  sector: string | null;
  date: string;
  detail: string | null;
  source: string | null;
  subscribed: boolean;
};

const EVENT_TYPES = [
  { value: "", label: "ALL EVENTS" },
  { value: "POLICY", label: "POLICY & FED" },
  { value: "EARNINGS", label: "EARNINGS" },
  { value: "DIVIDEND", label: "DIVIDENDS" },
  { value: "AGM", label: "AGMs" },
];

export default function EventsPage() {
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("");

  useEffect(() => {
    fetchEvents();
  }, [filterType]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = filterType ? `/api/events?type=${filterType}` : "/api/events";
      const data = await api.get<{ events: MarketEvent[] }>(url);
      setEvents(data.events);
    } catch (err: any) {
      setError(err.message || "Failed to load market events");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSubscribe = async (event: MarketEvent) => {
    try {
      if (event.subscribed) {
        // Unsubscribe
        await api.del(`/api/events/${event.id}/subscribe`);
        setEvents((prev) =>
          prev.map((e) => (e.id === event.id ? { ...e, subscribed: false } : e))
        );
      } else {
        // Subscribe
        await api.post(`/api/events/${event.id}/subscribe`);
        setEvents((prev) =>
          prev.map((e) => (e.id === event.id ? { ...e, subscribed: true } : e))
        );
      }
    } catch (err: any) {
      console.error("Subscription toggle failed", err);
    }
  };

  // Helper to get color values based on event type
  const getTypeStyles = (type: string) => {
    switch (type) {
      case "POLICY":
        return "border-amber-custom/30 text-amber-custom bg-amber-dim/20";
      case "EARNINGS":
        return "border-green-custom/30 text-green-custom bg-green-dim/20";
      case "DIVIDEND":
        return "border-cyan-custom/30 text-cyan-custom bg-cyan-dim/20";
      case "AGM":
        return "border-purple-custom/30 text-purple-custom bg-purple-dim/15";
      default:
        return "border-border-bright text-text-2 bg-bg-2";
    }
  };

  // Helper to format date into Month and Day
  const formatDateBlock = (dateStr: string) => {
    const d = new Date(dateStr);
    const month = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
    const day = d.getDate();
    return { month, day };
  };

  return (
    <div className="max-w-[900px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-6 animate-card-enter">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-[0.15em] text-text-custom uppercase">ECONOMIC &amp; CORPORATE CALENDAR</h1>
          <p className="font-mono text-[0.65rem] text-text-3 mt-1">
            Keep track of monetary policy reviews, central bank rates, ex-dividend dates, and quarterly earnings calls.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-1.5 font-mono text-[0.62rem]">
          {EVENT_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setFilterType(t.value)}
              className={`px-3 py-1 border transition-colors cursor-pointer uppercase ${
                filterType === t.value
                  ? "border-green-custom text-green-custom font-bold bg-green-dim/10"
                  : "border-border-custom text-text-2 hover:border-border-bright hover:text-text-custom"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="border border-red-custom/40 bg-red-dim p-4 font-mono text-xs text-red-custom leading-relaxed uppercase">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 font-mono text-xs text-text-3">Loading calendar events...</div>
      ) : events.length === 0 ? (
        <div className="border border-border-custom bg-bg-1 p-10 text-center font-mono text-xs text-text-3 uppercase">
          No upcoming events found matching criteria.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {events.map((evt) => {
            const { month, day } = formatDateBlock(evt.date);
            return (
              <div
                key={evt.id}
                className="border border-border-custom bg-bg-1 hover:border-border-bright transition-all p-4 sm:p-5 flex gap-4 items-start rounded"
              >
                {/* Date Display Block */}
                <div className="w-14 sm:w-16 h-14 sm:h-16 flex flex-col items-center justify-center border border-border-bright bg-bg-2 shrink-0 font-mono">
                  <span className="text-[0.6rem] text-text-3 font-bold">{month}</span>
                  <span className="text-xl sm:text-2xl font-bold text-text-custom leading-none mt-0.5">{day}</span>
                </div>

                {/* Event Details */}
                <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-mono text-[0.55rem] font-bold px-2 py-0.5 border uppercase rounded-sm ${getTypeStyles(evt.type)}`}>
                        {evt.type}
                      </span>
                      {evt.symbol && (
                        <Link
                          href={`/stock/${evt.symbol}`}
                          className="font-mono text-[0.58rem] font-bold text-cyan-custom hover:underline uppercase"
                        >
                          ${evt.symbol}
                        </Link>
                      )}
                      {evt.sector && (
                        <span className="font-mono text-[0.55rem] text-text-3 uppercase tracking-wider">
                          // {evt.sector}
                        </span>
                      )}
                    </div>
                    <h3 className="font-display text-lg text-text-custom tracking-[0.05em] uppercase leading-tight mt-1">{evt.title}</h3>
                    {evt.detail && <p className="font-body text-xs text-text-2 mt-0.5 leading-snug">{evt.detail}</p>}
                    {evt.source && <span className="font-mono text-[0.55rem] text-text-4 uppercase mt-1">Source: {evt.source}</span>}
                  </div>

                  {/* Subscribe Toggle Button */}
                  <div className="shrink-0 flex items-center">
                    <button
                      onClick={() => handleToggleSubscribe(evt)}
                      className={`w-full sm:w-auto px-4 py-2 font-mono text-[0.62rem] font-bold border transition-all uppercase cursor-pointer ${
                        evt.subscribed
                          ? "border-green-custom bg-green-dim text-green-custom shadow-glow-buy"
                          : "border-border-bright text-text-2 hover:border-green-custom hover:text-green-custom"
                      }`}
                    >
                      {evt.subscribed ? "✓ Subscribed" : "🔔 Get Notified"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
