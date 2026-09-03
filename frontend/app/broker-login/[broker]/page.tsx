"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { API_BASE, apiFetch } from "../../lib/api";

export default function BrokerLoginPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const broker = (params.broker as string || "zerodha").toLowerCase();
  const state = searchParams.get("state") || "";

  // Extract all callback parameters as requested
  const requestToken = searchParams.get("request_token") || "";
  const action = searchParams.get("action") || "";
  const type = searchParams.get("type") || "";
  const status = searchParams.get("status") || "";

  // Left blank on purpose — this form is a simulation (see noticeMsg below):
  // nothing typed here is transmitted or checked. Pre-filling with
  // realistic-looking credentials would make it look like a real saved
  // login, not a demo.
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCalledCallback = useRef(false);

  // Auto-complete connection if request_token (Zerodha) or code (other OAuth) is in URL search parameters
  useEffect(() => {
    const code = searchParams.get("code") || requestToken;
    if (!code || hasCalledCallback.current) return;

    hasCalledCallback.current = true;
    let active = true;
    const executeCallback = async () => {
      setLoading(true);
      setError(null);
      try {
        await apiFetch(`/api/brokers/callback/${broker.toUpperCase()}?code=${code}&state=${state}`);
        
        // Trigger holdings sync with Bearer token authentication
        await apiFetch(`/api/brokers/${broker.toUpperCase()}/sync`, {
          method: "POST",
        });

        if (active) {
          router.push("/portfolio?synced=true");
        }
      } catch (err) {
        if (active) {
          let errMsg = err instanceof Error ? err.message : "OAuth connection failed";
          
          // Map provider-specific API error codes to user-friendly messages
          if (err && typeof err === "object" && "code" in err) {
            const code = (err as any).code;
            if (code === "UPSTOX_INVALID_CLIENT") {
              errMsg = "Invalid Upstox application credentials. Please verify the StockPulse Upstox API Key and Secret.";
            } else if (code === "UPSTOX_INVALID_REDIRECT_URI") {
              errMsg = "Redirect URI mismatch. Please verify the Upstox application configuration.";
            } else if (code === "UPSTOX_INVALID_AUTHORIZATION_CODE") {
              errMsg = "The authorization code is invalid or has already been used. Please try connecting again.";
            } else if (code === "UPSTOX_ACCOUNT_ERROR") {
              errMsg = "Upstox requires an account-level action before the connection can be completed.";
            } else if (
              code === "UPSTOX_PROVIDER_ERROR" || 
              code === "UPSTOX_AUTHENTICATION_ERROR" || 
              code === "UPSTOX_UNKNOWN_ERROR" ||
              code === "UPSTOX_TOKEN_EXCHANGE_FAILED"
            ) {
              errMsg = "Upstox could not complete authentication. Please try again later.";
            }
          }
          
          setError(errMsg);
          setLoading(false);
        }
      }
    };

    executeCallback();
    return () => {
      active = false;
    };
  }, [searchParams, broker, state, router, requestToken, action, type, status]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Simulate callback to backend callback route using apiFetch
      await apiFetch(`/api/brokers/callback/${broker.toUpperCase()}?code=mock_code_123&state=${state}`);
      
      // Trigger holdings sync using apiFetch
      await apiFetch(`/api/brokers/${broker.toUpperCase()}/sync`, {
        method: "POST",
      });

      router.push("/portfolio?synced=true");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setLoading(false);
    }
  };

  const isUpstox = broker === "upstox";
  const brandName = isUpstox ? "UPSTOX CONNECT" : "KITE CONNECT";
  const portalName = isUpstox ? "Upstox Login Simulation Portal" : "Demat Login Simulation Portal";
  const userFieldLabel = isUpstox ? "Upstox User ID / Mobile" : "Kite User ID";
  const passFieldLabel = "Password";
  const pinFieldLabel = isUpstox ? "Year of Birth (YYYY)" : "6-Digit PIN";
  const brandColor = isUpstox ? "#5e35b1" : "#ff5722";
  const brandColorHover = isUpstox ? "#4527a0" : "#e64a19";
  const noticeMsg = "Simulated connection: this form doesn't check or transmit what you type — submitting it (with any values, or none) links a demo holdings set to your account so you can try the portfolio features. It never contacts your real broker.";

  if (loading && !error) {
    return (
      <div className="min-h-screen bg-[#111111] flex items-center justify-center p-4">
        <div className="max-w-[420px] w-full bg-[#1b1b1b] border border-border-custom p-8 rounded text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 mx-auto mb-4" style={{ borderColor: brandColor }}></div>
          <h2 className="font-mono text-xs text-text-custom uppercase tracking-[0.15em] mb-2">
            CONNECTING TO {isUpstox ? "UPSTOX" : "ZERODHA KITE"}...
          </h2>
          <p className="font-mono text-[0.68rem] text-text-3 leading-relaxed">
            Exchanging secure authorization credentials and synchronizing active holdings.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    const isSegmentInactive = error.includes("No segments") || error.includes("segment");
    return (
      <div className="min-h-screen bg-[#111111] flex items-center justify-center p-4">
        <div className="max-w-[420px] w-full bg-[#1b1b1b] border border-border-custom shadow-2xl p-8 rounded flex flex-col gap-6">
          <div className="text-center border-b border-border-custom pb-4">
            <span className="font-mono text-[0.55rem] text-text-3 uppercase tracking-wider block mb-1">CONNECTION STATE</span>
            <h2 className="font-display text-lg font-bold text-red-custom uppercase tracking-wide">
              {isUpstox ? "UPSTOX CONNECTION ERROR" : "ZERODHA CONNECTION ERROR"}
            </h2>
          </div>

          {isUpstox && isSegmentInactive ? (
            <div className="p-4 border border-amber-custom bg-amber-custom/5 font-mono text-xs rounded text-text-custom leading-relaxed">
              <div className="font-bold text-amber-custom mb-2">⚠️ INACTIVE ACCOUNT SEGMENTS</div>
              <p className="mb-2 text-[0.75rem]">Your Upstox account appears to have no active trading segments.</p>
              <p className="text-[0.68rem] text-text-2">
                Please reactivate your Equity/F&O segments directly from the Upstox app or web dashboard, and then try connecting again.
              </p>
            </div>
          ) : (
            <div className="p-4 border border-red-custom bg-red-dim/10 font-mono text-xs rounded text-text-custom leading-relaxed">
              <div className="font-bold text-red-custom mb-1">❌ ERROR DETAILS</div>
              <p className="text-[0.72rem] text-text-2 mt-1">{error}</p>
            </div>
          )}

          <button
            onClick={() => router.push("/portfolio")}
            className="w-full bg-bg-2 hover:bg-bg border border-border-custom text-text-custom font-mono text-xs py-3 rounded uppercase transition-colors duration-150 cursor-pointer"
          >
            ← Return to Portfolio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111111] flex items-center justify-center p-4">
      <div className="max-w-[420px] w-full bg-[#1b1b1b] border border-border-custom shadow-2xl p-8 rounded">
        
        {/* Logo Header */}
        <div className="text-center mb-6">
          <div 
            className="inline-block text-white font-display text-xl font-bold tracking-[0.1em] px-3 py-1 mb-2"
            style={{ backgroundColor: brandColor }}
          >
            {brandName}
          </div>
          <h2 className="text-xs text-text-3 font-mono uppercase tracking-[0.1em]">
            {portalName}
          </h2>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block font-mono text-[0.65rem] text-text-3 mb-1 uppercase">{userFieldLabel}</label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full bg-[#111111] border border-border-custom rounded p-2.5 text-text-custom font-mono text-xs outline-none focus:border-border-bright"
            />
          </div>

          <div>
            <label className="block font-mono text-[0.65rem] text-text-3 mb-1 uppercase">{passFieldLabel}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#111111] border border-border-custom rounded p-2.5 text-text-custom font-mono text-xs outline-none focus:border-border-bright"
            />
          </div>

          <div>
            <label className="block font-mono text-[0.65rem] text-text-3 mb-1 uppercase">{pinFieldLabel}</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full bg-[#111111] border border-border-custom rounded p-2.5 text-text-custom font-mono text-xs outline-none focus:border-border-bright"
            />
          </div>

          <div
            className="p-3 font-mono text-[0.55rem] leading-relaxed mt-2 rounded border"
            style={{ backgroundColor: `${brandColor}0d`, borderColor: `${brandColor}33`, color: brandColor }}
          >
            {noticeMsg}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full text-white font-mono text-xs font-bold p-3 rounded mt-2 tracking-wider uppercase transition-colors duration-150 cursor-pointer border-none"
            style={{ backgroundColor: brandColor }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = brandColorHover)}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = brandColor)}
          >
            LOGIN & SECURE SYNC →
          </button>
        </form>
      </div>
    </div>
  );
}
