"use client";

import { useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";

export default function BrokerLoginPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const broker = (params.broker as string || "zerodha").toLowerCase();
  const state = searchParams.get("state") || "";

  const [userId, setUserId] = useState("AB1234");
  const [password, setPassword] = useState("password123");
  const [pin, setPin] = useState("123456");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Simulate callback to backend callback route
      const res = await fetch(`http://localhost:5000/api/brokers/callback/${broker.toUpperCase()}?code=mock_code_123&state=${state}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Login simulation failed");
      }
      
      // Trigger holdings sync with correct device-id
      const deviceId = localStorage.getItem("sp_device_id") || "";
      const syncRes = await fetch(`http://localhost:5000/api/brokers/${broker.toUpperCase()}/sync`, {
        method: "POST",
        headers: { "x-device-id": deviceId },
      });

      if (!syncRes.ok) {
        const data = await syncRes.json();
        throw new Error(data.error || "Simulated holdings sync failed");
      }

      router.push("/portfolio?synced=true");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111111] flex items-center justify-center p-4">
      <div className="max-w-[420px] w-full bg-[#1b1b1b] border border-border-custom shadow-2xl p-8 rounded">
        
        {/* Logo Header */}
        <div className="text-center mb-6">
          <div className="inline-block bg-[#ff5722] text-white font-display text-xl font-bold tracking-[0.1em] px-3 py-1 mb-2">
            KITE CONNECT
          </div>
          <h2 className="text-xs text-text-3 font-mono uppercase tracking-[0.1em]">
            Demat Login Simulation Portal
          </h2>
        </div>

        {error && (
          <div className="mb-4 p-3 border border-red-custom bg-red-dim font-mono text-[0.68rem] text-red-custom">
            Error: {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block font-mono text-[0.65rem] text-text-3 mb-1 uppercase">Kite User ID</label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full bg-[#111111] border border-border-custom rounded p-2.5 text-text-custom font-mono text-xs outline-none focus:border-[#ff5722]"
              required
            />
          </div>

          <div>
            <label className="block font-mono text-[0.65rem] text-text-3 mb-1 uppercase">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#111111] border border-border-custom rounded p-2.5 text-text-custom font-mono text-xs outline-none focus:border-[#ff5722]"
              required
            />
          </div>

          <div>
            <label className="block font-mono text-[0.65rem] text-text-3 mb-1 uppercase">6-Digit PIN</label>
            <input
              type="password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full bg-[#111111] border border-border-custom rounded p-2.5 text-text-custom font-mono text-xs outline-none focus:border-[#ff5722]"
              required
            />
          </div>

          <div className="p-3 bg-[#ff5722]/5 border border-[#ff5722]/20 font-mono text-[0.55rem] text-[#ff5722] leading-relaxed mt-2 rounded">
            Notice: Developer keys not configured. Running in secure demo connection mode to Zerodha Kite API.
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#ff5722] hover:bg-[#e64a19] text-white font-mono text-xs font-bold p-3 rounded mt-2 tracking-wider uppercase transition-colors duration-150"
          >
            {loading ? "AUTHORIZING..." : "LOGIN & SECURE SYNC →"}
          </button>
        </form>
      </div>
    </div>
  );
}
