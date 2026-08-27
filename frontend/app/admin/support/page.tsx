"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";

type SupportTicket = {
  id: string;
  userId: string;
  subject: string;
  category: string;
  status: "OPEN" | "IN_PROGRESS" | "WAITING_FOR_USER" | "RESOLVED" | "CLOSED";
  priority: string;
  createdAt: string;
  updatedAt: string;
  user: { username: string };
  messages: {
    id: string;
    author: "USER" | "SUPPORT";
    body: string;
    createdAt: string;
  }[];
};

export default function SupportDeskPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [replyStatus, setReplyStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<SupportTicket[]>("/api/admin/support");
      setTickets(res);
      
      // Auto-update selected ticket if active
      if (selectedTicket) {
        const updated = res.find((t) => t.id === selectedTicket.id);
        if (updated) setSelectedTicket(updated);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load support tickets");
    } finally {
      setLoading(false);
    }
  }, [selectedTicket]);

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyMessage.trim()) return;

    try {
      await api.patch(`/api/admin/support/${selectedTicket.id}`, {
        message: replyMessage.trim(),
        status: replyStatus || selectedTicket.status,
      });

      alert("Support message reply sent successfully");
      setReplyMessage("");
      setReplyStatus("");
      fetchTickets();
    } catch (err: any) {
      alert(err.message || "Failed to post support response");
    }
  };

  return (
    <div className="p-6 sm:p-8 flex flex-col gap-6 animate-card-enter">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-border-custom pb-4">
        <div>
          <h1 className="font-display text-xl tracking-[0.1em] text-red-custom uppercase">
            Support Desk Queue
          </h1>
          <p className="font-mono text-[0.65rem] text-text-3 mt-1 uppercase">
            Resolve user complaints, answer support requests, and manage ticket priorities
          </p>
        </div>
      </div>

      {error && (
        <div className="border border-red-custom/40 bg-red-dim/15 p-4 font-mono text-xs text-red-custom uppercase rounded">
          ⚠️ {error}
        </div>
      )}

      {loading && tickets.length === 0 ? (
        <div className="p-8 text-center font-mono text-xs text-text-3 animate-pulse">
          OPENING TICKET SYSTEM CONNECTOR...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch font-mono text-xs">
          {/* Left: Queue List */}
          <div className="lg:col-span-5 border border-border-custom bg-bg-1 p-4 rounded flex flex-col gap-4 max-h-[600px] overflow-hidden">
            <h3 className="text-xs font-bold text-text-custom uppercase border-b border-border-custom pb-2">// Active Tickets</h3>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
              {tickets.length === 0 ? (
                <div className="text-center text-text-4 py-8">No tickets logged in system</div>
              ) : (
                tickets.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTicket(t)}
                    className={`p-3 border rounded cursor-pointer transition-all duration-150 ${
                      selectedTicket?.id === t.id
                        ? "border-red-custom bg-red-dim/5"
                        : "border-border-custom bg-bg-2/30 hover:border-border-bright"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[0.6rem] mb-1">
                      <span className="text-text-3">Cat: {t.category}</span>
                      <span className={`px-1.5 py-0.2 rounded-sm font-bold uppercase ${
                        t.status === "OPEN" ? "bg-red-dim text-red-custom" :
                        t.status === "IN_PROGRESS" ? "bg-amber-dim text-amber-custom" : "bg-bg-3 text-text-4"
                      }`}>{t.status}</span>
                    </div>
                    <h4 className="font-display text-[0.75rem] text-text-custom truncate leading-snug uppercase">
                      {t.subject}
                    </h4>
                    <div className="flex justify-between items-center text-[0.58rem] text-text-4 mt-1.5">
                      <span>User: @{t.user?.username || "unknown"}</span>
                      <span>Update: {new Date(t.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Message Thread */}
          <div className="lg:col-span-7 border border-border-custom bg-bg-1 p-4 rounded flex flex-col justify-between min-h-[500px]">
            {selectedTicket ? (
              <div className="flex flex-col h-full justify-between gap-4">
                <div className="border-b border-border-custom pb-2 shrink-0">
                  <span className="text-[0.62rem] text-text-3 uppercase block">Ticket ID: {selectedTicket.id}</span>
                  <h3 className="font-display text-sm text-text-custom tracking-wide uppercase mt-0.5">
                    {selectedTicket.subject}
                  </h3>
                </div>

                {/* Message items list */}
                <div className="flex-1 overflow-y-auto max-h-[300px] flex flex-col gap-3 pr-1 bg-bg-2/20 p-3 rounded">
                  {selectedTicket.messages.map((m) => (
                    <div key={m.id} className={`flex flex-col gap-1 max-w-[85%] ${m.author === "SUPPORT" ? "self-end items-end" : "self-start items-start"}`}>
                      <div className="flex items-center gap-2 text-[0.58rem] text-text-4">
                        <span className="font-bold text-text-2">{m.author === "SUPPORT" ? "Support" : "User"}</span>
                        <span>{new Date(m.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <div className={`p-2.5 rounded text-xs leading-relaxed ${
                        m.author === "SUPPORT"
                          ? "bg-red-dim border border-red-custom/25 text-text-custom"
                          : "bg-bg-2 border border-border-custom text-text-2"
                      }`}>
                        {m.body}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Reply console */}
                <form onSubmit={handleSendReply} className="flex flex-col gap-3 shrink-0 pt-2 border-t border-border-custom">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <textarea
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder="Write response message..."
                      rows={3}
                      required
                      className="flex-1 bg-bg border border-border-custom text-text-custom p-2 focus:border-red-custom focus:outline-none placeholder:text-text-4"
                    />
                    <div className="flex flex-col gap-1.5 shrink-0 justify-center">
                      <label className="text-text-3 uppercase text-[0.6rem] font-bold">Update Status:</label>
                      <select
                        value={replyStatus}
                        onChange={(e) => setReplyStatus(e.target.value)}
                        className="bg-bg border border-border-custom text-text-custom p-2 focus:outline-none"
                      >
                        <option value="">Keep current</option>
                        <option value="OPEN">OPEN</option>
                        <option value="IN_PROGRESS">IN PROGRESS</option>
                        <option value="WAITING_FOR_USER">WAITING FOR USER</option>
                        <option value="RESOLVED">RESOLVED</option>
                        <option value="CLOSED">CLOSED</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-6 py-2 bg-red-custom text-bg border-none font-bold uppercase transition-all duration-150 cursor-pointer hover:bg-opacity-90"
                    >
                      Send Message
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-text-4 text-center">
                Select a support ticket from the active queue to view the thread and respond
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
