"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import NotificationSystem, { Toast } from "../components/NotificationSystem";
import { API_BASE, setSession } from "../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [authView, setAuthView] = useState<"login" | "register" | "forgot" | "reset">("login");
  const isLogin = authView === "login";
  const [otpCode, setOtpCode] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // If already logged in, redirect to dashboard
  useEffect(() => {
    const user = localStorage.getItem("sp_username");
    if (user) {
      router.push("/");
    }
  }, [router]);

  const addToast = useCallback((toast: Omit<Toast, "id" | "timestamp">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-3), { ...toast, id, timestamp: Date.now() }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const handleForgotPasswordRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      addToast({ type: "warning", title: "Missing Email", message: "Please enter your email address." });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        addToast({ type: "success", title: "OTP Sent", message: "If registered, an OTP code has been sent. Check your logs/terminal!" });
        setAuthView("reset");
      } else {
        addToast({ type: "danger", title: "Error", message: data.error || "Failed to request reset OTP." });
      }
    } catch {
      addToast({ type: "danger", title: "Connection Error", message: "Failed to connect to authentication server." });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim() || !otpCode.trim() || !password.trim()) {
      addToast({ type: "warning", title: "Missing Fields", message: "Please fill in all reset fields." });
      return;
    }
    if (password.length < 8) {
      addToast({ type: "warning", title: "Invalid Password", message: "Password must be at least 8 characters long." });
      return;
    }
    setLoading(true);
    try {
      // Step 1: Verify OTP and get resetToken
      const verifyRes = await fetch(`${API_BASE}/api/auth/verify-reset-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: resetEmail.trim(),
          otp: otpCode.trim(),
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        addToast({ type: "danger", title: "OTP Verification Failed", message: verifyData.error || "Incorrect or expired OTP." });
        setLoading(false);
        return;
      }

      const { resetToken } = verifyData;

      // Step 2: Reset password using token
      const resetRes = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resetToken,
          newPassword: password.trim(),
        }),
      });
      const resetData = await resetRes.json();
      if (resetRes.ok && resetData.success) {
        addToast({ type: "success", title: "Password Reset", message: "Password updated successfully! Please sign in." });
        setPassword("");
        setOtpCode("");
        setResetEmail("");
        setAuthView("login");
      } else {
        addToast({ type: "danger", title: "Reset Failed", message: resetData.error || "Reset verification failed." });
      }
    } catch {
      addToast({ type: "danger", title: "Connection Error", message: "Failed to connect to server." });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      addToast({ type: "warning", title: "Missing Fields", message: "Please enter your username/email and password." });
      return;
    }

    if (!isLogin && !email.trim()) {
      addToast({ type: "warning", title: "Missing Fields", message: "Please enter your email address." });
      return;
    }

    if (!isLogin && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      addToast({ type: "warning", title: "Invalid Email", message: "Please enter a valid email format." });
      return;
    }

    setLoading(true);
    const endpoint = isLogin ? "login" : "register";

    try {
      const res = await fetch(`${API_BASE}/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password: password.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        addToast({
          type: "success",
          title: isLogin ? "Welcome Back" : "Account Created",
          message: isLogin ? "Login successful! Redirecting..." : "Registration successful! Logging in...",
        });

        // Set local storage session details
        setSession({ token: data.token, deviceId: data.deviceId, username: data.user?.username ?? username.trim() });

        const adminRoles = ["SUPER_ADMIN", "ADMIN", "KYC_ADMIN", "CONTENT_ADMIN", "SUPPORT_ADMIN"];
        const isAdmin = adminRoles.includes(data.user?.role || "");

        // Redirect to dashboard after a brief delay
        setTimeout(() => {
          const targetUrl = isAdmin ? "/admin" : "/";
          router.push(targetUrl);
          // Force a full top bar reload to display username
          window.location.href = targetUrl;
        }, 800);
      } else {
        addToast({
          type: "danger",
          title: isLogin ? "Login Failed" : "Registration Failed",
          message: data.error || "An error occurred. Please try again.",
        });
      }
    } catch {
      addToast({
        type: "danger",
        title: "Connection Error",
        message: "Failed to connect to authentication server.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-32px)] bg-bg flex items-center justify-center overflow-hidden p-6 select-none">
      
      {/* ── Motion Shifting Background Blobs ── */}
      <div className="absolute top-[10%] left-[10%] w-[350px] h-[350px] rounded-full bg-green-custom/10 filter blur-[90px] animate-float-blob mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[10%] right-[10%] w-[400px] h-[400px] rounded-full bg-blue-custom/10 filter blur-[100px] animate-float-blob-reverse mix-blend-screen pointer-events-none" />
      <div className="absolute top-[40%] right-[25%] w-[300px] h-[300px] rounded-full bg-purple-custom/10 filter blur-[80px] animate-float-blob mix-blend-screen pointer-events-none" />

      {/* Grid Pattern Overlay */}
      <div 
        className="absolute inset-0 opacity-15 pointer-events-none" 
        style={{
          backgroundImage: `
            repeating-linear-gradient(0deg, transparent, transparent 29px, var(--color-border-custom) 30px),
            repeating-linear-gradient(90deg, transparent, transparent 29px, var(--color-border-custom) 30px)
          `
        }} 
      />

      {/* ── Glassmorphism Login Card ── */}
      <div className="relative z-10 w-full max-w-[400px] bg-bg-1/40 backdrop-blur-xl border border-border-bright p-8 rounded-lg shadow-[0_20px_50px_rgba(0,0,0,0.6)] animate-card-enter flex flex-col gap-6">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-9 h-9 relative flex items-center justify-center">
            <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <polyline
                points="2,22 7,14 11,18 16,8 20,12 26,4"
                stroke="#00e5a0"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <circle cx="26" cy="4" r="2" fill="#00e5a0" />
            </svg>
          </div>
          <h1 className="font-display text-[2.2rem] tracking-[0.15em] text-text-custom leading-none">
            STOCK<span className="text-green-custom">PULSE</span>
          </h1>
          <p className="font-mono text-[0.6rem] text-text-3 tracking-[0.15em] uppercase">
            {"VIRTUAL PORTFOLIO & THESIS LOG"}
          </p>
        </div>

        {/* Tab Selection */}
        {(authView === "login" || authView === "register") && (
          <div className="grid grid-cols-2 border border-border-custom bg-bg-2/30 rounded p-[2px]">
            <button
              onClick={() => {
                setAuthView("login");
                setUsername("");
                setEmail("");
                setPassword("");
              }}
              className={`py-2 font-mono text-[0.7rem] font-bold tracking-[0.08em] uppercase rounded transition-colors cursor-pointer ${
                isLogin ? "bg-bg-3 text-green-custom border border-border-bright" : "text-text-3 hover:text-text-2 bg-transparent"
              }`}
            >
              SIGN IN
            </button>
            <button
              onClick={() => {
                setAuthView("register");
                setUsername("");
                setEmail("");
                setPassword("");
              }}
              className={`py-2 font-mono text-[0.7rem] font-bold tracking-[0.08em] uppercase rounded transition-colors cursor-pointer ${
                !isLogin ? "bg-bg-3 text-green-custom border border-border-bright" : "text-text-3 hover:text-text-2 bg-transparent"
              }`}
            >
              CREATE ACCOUNT
            </button>
          </div>
        )}

        {/* Action Form */}
        {authView === "forgot" ? (
          <form onSubmit={handleForgotPasswordRequest} className="flex flex-col gap-4">
            <div>
              <label className="block font-mono text-[0.62rem] text-text-3 tracking-[0.08em] uppercase mb-1">
                EMAIL ADDRESS
              </label>
              <input
                type="email"
                placeholder="ENTER REGISTERED EMAIL ADDRESS"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="w-full bg-bg-2 border border-border-bright rounded p-3 text-text-custom font-mono text-xs outline-none focus:border-green-custom focus:ring-1 focus:ring-green-custom placeholder:text-text-4"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full font-mono text-xs font-bold bg-green-custom text-bg border-none py-3 px-4 rounded cursor-pointer tracking-wider uppercase mt-2 transition-opacity hover:opacity-90 active:scale-98 disabled:opacity-50"
            >
              {loading ? "SENDING OTP..." : "REQUEST RESET OTP →"}
            </button>
            <button
              type="button"
              onClick={() => setAuthView("login")}
              className="bg-transparent border-none text-[0.68rem] font-mono text-text-3 hover:text-green-custom hover:underline cursor-pointer py-1"
            >
              ← BACK TO SIGN IN
            </button>
          </form>
        ) : authView === "reset" ? (
          <form onSubmit={handleResetPasswordConfirm} className="flex flex-col gap-4">
            <div className="p-3 bg-bg-2/50 border border-border-custom rounded text-center">
              <span className="font-mono text-[0.58rem] text-text-3 uppercase block tracking-wider">Sending OTP code to</span>
              <span className="font-mono text-xs text-text-custom font-bold">{resetEmail}</span>
            </div>
            <div>
              <label className="block font-mono text-[0.62rem] text-text-3 tracking-[0.08em] uppercase mb-1">
                OTP CODE
              </label>
              <input
                type="text"
                placeholder="ENTER OTP CODE"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="w-full bg-bg-2 border border-border-bright rounded p-3 text-text-custom font-mono text-xs outline-none focus:border-green-custom focus:ring-1 focus:ring-green-custom placeholder:text-text-4"
                required
              />
            </div>
            <div>
              <label className="block font-mono text-[0.62rem] text-text-3 tracking-[0.08em] uppercase mb-1">
                NEW PASSWORD
              </label>
              <input
                type="password"
                placeholder="ENTER NEW PASSWORD (MIN 8 CHARS)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-bg-2 border border-border-bright rounded p-3 text-text-custom font-mono text-xs outline-none focus:border-green-custom focus:ring-1 focus:ring-green-custom placeholder:text-text-4"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full font-mono text-xs font-bold bg-green-custom text-bg border-none py-3 px-4 rounded cursor-pointer tracking-wider uppercase mt-2 transition-opacity hover:opacity-90 active:scale-98 disabled:opacity-50"
            >
              {loading ? "RESETTING..." : "RESET PASSWORD & SIGN IN →"}
            </button>
            <button
              type="button"
              onClick={() => setAuthView("login")}
              className="bg-transparent border-none text-[0.68rem] font-mono text-text-3 hover:text-green-custom hover:underline cursor-pointer py-1"
            >
              ← BACK TO SIGN IN
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block font-mono text-[0.62rem] text-text-3 tracking-[0.08em] uppercase mb-1">
                {isLogin ? "USERNAME OR EMAIL" : "USERNAME"}
              </label>
              <input
                type="text"
                placeholder={isLogin ? "ENTER USERNAME OR EMAIL" : "ENTER USERNAME"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-bg-2 border border-border-bright rounded p-3 text-text-custom font-mono text-xs outline-none focus:border-green-custom focus:ring-1 focus:ring-green-custom placeholder:text-text-4"
                required
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block font-mono text-[0.62rem] text-text-3 tracking-[0.08em] uppercase mb-1">
                  EMAIL ADDRESS
                </label>
                <input
                  type="email"
                  placeholder="ENTER EMAIL ADDRESS"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-bg-2 border border-border-bright rounded p-3 text-text-custom font-mono text-xs outline-none focus:border-green-custom focus:ring-1 focus:ring-green-custom placeholder:text-text-4"
                  required
                />
              </div>
            )}

            <div>
              <label className="block font-mono text-[0.62rem] text-text-3 tracking-[0.08em] uppercase mb-1">
                PASSWORD
              </label>
              <input
                type="password"
                placeholder="ENTER PASSWORD"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-bg-2 border border-border-bright rounded p-3 text-text-custom font-mono text-xs outline-none focus:border-green-custom focus:ring-1 focus:ring-green-custom placeholder:text-text-4"
                required
              />
              {isLogin && (
                <div className="flex justify-end mt-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(username.includes("@") ? username : "");
                      setAuthView("forgot");
                    }}
                    className="bg-transparent border-none text-[0.62rem] font-mono text-green-custom hover:underline cursor-pointer p-0"
                  >
                    FORGOT PASSWORD?
                  </button>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full font-mono text-xs font-bold bg-green-custom text-bg border-none py-3 px-4 rounded cursor-pointer tracking-wider uppercase mt-2 transition-opacity hover:opacity-90 active:scale-98 disabled:opacity-50"
            >
              {loading
                ? (isLogin ? "SIGNING IN..." : "REGISTERING...")
                : (isLogin ? "SIGN IN →" : "REGISTER ACCOUNT →")}
            </button>
          </form>
        )}

        <div className="font-mono text-[0.55rem] text-text-3 text-center tracking-[0.05em] leading-normal border-t border-border-custom pt-4">
          {isLogin
            ? "DEMO AUTHENTICATION · NEW ACCOUNTS GET ₹10,00,000 & $10,000 PLAY FUNDS"
            : "CREDENTIALS REMAIN SECURE ON LOCAL MIGRATED EXPRESS SQLITE ENGINE"}
        </div>

      </div>

      {/* Dismissable Alerts */}
      <NotificationSystem toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
