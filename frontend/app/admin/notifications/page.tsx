"use client";

import { useState } from "react";
import { api } from "../../lib/api";

export default function NotificationsConsolePage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<"SECURITY" | "MARKET" | "ALERT" | "SYSTEM">("SYSTEM");
  const [targetUserId, setTargetUserId] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      alert("Please fill in Title and Message fields");
      return;
    }

    const isBroadcast = !targetUserId.trim();
    const confirmMsg = isBroadcast
      ? `🚨 WARNING: BROADCAST NOTIFICATION\n\nYou are about to broadcast this notification to ALL active users in the system.\n\nTitle: "${title}"\n\nAre you sure you want to proceed?`
      : `Send notification to user ID: ${targetUserId.trim()}?\n\nTitle: "${title}"\n\nProceed?`;

    if (!confirm(confirmMsg)) return;

    try {
      setSending(true);
      await api.post("/api/admin/notifications", {
        title: title.trim(),
        body: body.trim(),
        type,
        userId: targetUserId.trim() || undefined,
      });

      alert("Notification sent successfully!");
      setTitle("");
      setBody("");
      setTargetUserId("");
    } catch (err: any) {
      alert(err.message || "Failed to dispatch notification");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 sm:p-8 flex flex-col gap-6 animate-card-enter">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-border-custom pb-4">
        <div>
          <h1 className="font-display text-xl tracking-[0.1em] text-red-custom uppercase">
            Platform Notification Console
          </h1>
          <p className="font-mono text-[0.65rem] text-text-3 mt-1 uppercase">
            Broadcast emergency alerts, dispatch compliance reminders, or notify specific user accounts
          </p>
        </div>
      </div>

      <div className="max-w-xl border border-border-custom bg-bg-1 p-6 rounded flex flex-col gap-4 font-mono text-xs">
        <h3 className="text-xs font-bold text-text-custom uppercase border-b border-border-custom pb-2">
          // Dispatch Alert Form
        </h3>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-text-3 uppercase text-[0.62rem]">Notification Title:</label>
            <input
              type="text"
              placeholder="e.g. System Maintenance Scheduled"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="bg-bg border border-border-custom text-text-custom p-2.5 focus:outline-none placeholder:text-text-4"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-text-3 uppercase text-[0.62rem]">Category Classification:</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="bg-bg border border-border-custom text-text-custom p-2.5 focus:outline-none"
            >
              <option value="SYSTEM">SYSTEM ALERT</option>
              <option value="SECURITY">SECURITY UPDATE</option>
              <option value="MARKET">MARKET SIGNAL</option>
              <option value="ALERT">LIMIT TRIGGER</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-text-3 uppercase text-[0.62rem]">Target User ID (Optional):</label>
            <input
              type="text"
              placeholder="Leave blank to BROADCAST to all active users"
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="bg-bg border border-border-custom text-text-custom p-2.5 focus:outline-none placeholder:text-text-4"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-text-3 uppercase text-[0.62rem]">Notification Message:</label>
            <textarea
              rows={4}
              placeholder="Write notification message content details..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              className="bg-bg border border-border-custom text-text-custom p-2.5 focus:outline-none placeholder:text-text-4"
            />
          </div>

          <div className="flex justify-end mt-2">
            <button
              type="submit"
              disabled={sending}
              className="px-6 py-2.5 bg-red-custom hover:bg-opacity-90 border-none text-bg font-bold uppercase transition-all duration-150 cursor-pointer disabled:opacity-50"
            >
              {sending ? "Dispatching..." : "Dispatch Notification"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
