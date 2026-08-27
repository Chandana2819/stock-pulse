"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "../lib/api";

type Permission =
  | "users"
  | "kyc"
  | "portfolios"
  | "market"
  | "signals"
  | "alerts"
  | "community"
  | "learning"
  | "ipo"
  | "mutual-funds"
  | "notifications"
  | "support"
  | "analytics"
  | "system"
  | "settings";

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  SUPER_ADMIN: [
    "users",
    "kyc",
    "portfolios",
    "market",
    "signals",
    "alerts",
    "community",
    "learning",
    "ipo",
    "mutual-funds",
    "notifications",
    "support",
    "analytics",
    "system",
    "settings",
  ],
  ADMIN: [
    "users",
    "kyc",
    "analytics",
    "support",
    "community",
    "learning",
    "ipo",
    "mutual-funds",
    "notifications",
  ],
  KYC_ADMIN: ["kyc"],
  CONTENT_ADMIN: ["learning", "community", "ipo", "mutual-funds"],
  SUPPORT_ADMIN: ["users", "support"],
};

type AdminLink = {
  href: string;
  label: string;
  permission?: Permission;
  icon: string;
};

const ADMIN_LINKS: AdminLink[] = [
  { href: "/admin", label: "Overview", icon: "📊" },
  { href: "/admin/analytics", label: "Analytics", permission: "analytics", icon: "📈" },
  { href: "/admin/users", label: "Users", permission: "users", icon: "👥" },
  { href: "/admin/kyc", label: "KYC Review", permission: "kyc", icon: "🆔" },
  { href: "/admin/portfolios", label: "Portfolios", permission: "portfolios", icon: "💼" },
  { href: "/admin/market", label: "Market Status", permission: "market", icon: "🏛️" },
  { href: "/admin/signals", label: "Stock Signals", permission: "signals", icon: "📶" },
  { href: "/admin/alerts", label: "Triggered Alerts", permission: "alerts", icon: "🚨" },
  { href: "/admin/community", label: "Moderation", permission: "community", icon: "💬" },
  { href: "/admin/learning", label: "Learning Content", permission: "learning", icon: "📚" },
  { href: "/admin/ipo", label: "IPOs List", permission: "ipo", icon: "🚀" },
  { href: "/admin/mutual-funds", label: "Mutual Funds", permission: "mutual-funds", icon: "📈" },
  { href: "/admin/notifications", label: "Push Console", permission: "notifications", icon: "🔔" },
  { href: "/admin/support", label: "Support Desk", permission: "support", icon: "🛠️" },
  { href: "/admin/system", label: "System Health", permission: "system", icon: "🩺" },
  { href: "/admin/settings", label: "Settings", permission: "settings", icon: "⚙️" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ username: string; role: string } | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAdminProfile = async () => {
      try {
        const u = await apiFetch<{ username: string; role: string }>("/api/user");
        setUser(u);
        const perms = ROLE_PERMISSIONS[u.role] || [];
        setPermissions(perms);
      } catch (err) {
        console.error("Failed to load admin profile layout:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAdminProfile();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg font-mono text-xs text-text-3">
        INITIALIZING CONSOLE INTERFACE...
      </div>
    );
  }

  // Filter links based on current role permissions
  const allowedLinks = ADMIN_LINKS.filter(
    (link) => !link.permission || permissions.includes(link.permission)
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-text-custom">
      {/* Sidebar Navigation */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border-custom bg-bg-1 shrink-0 h-full overflow-hidden">
        {/* Logo Section */}
        <div className="flex items-center gap-3 py-5 px-6 border-b border-border-custom justify-between shrink-0">
          <Link href="/admin" className="flex items-center gap-3 no-underline">
            <div className="w-6 h-6 relative flex items-center justify-center shrink-0">
              <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <polyline points="2,22 7,14 11,18 16,8 20,12 26,4" stroke="#ff3b5c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <circle cx="26" cy="4" r="2.5" fill="#ff3b5c" />
              </svg>
            </div>
            <h1 className="font-display text-[1.15rem] tracking-[0.1em] text-red-custom leading-none select-none uppercase">
              STOCK<span className="text-text-custom">PULSE OPS</span>
            </h1>
          </Link>
        </div>

        {/* Scrollable Links */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[0.62rem] text-red-custom/75 uppercase tracking-wider px-3 mb-1 block font-bold">
              Operations Center
            </span>
            {allowedLinks.map((l) => {
              const isActive = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex items-center gap-3 py-2 px-3 rounded font-mono text-[0.78rem] tracking-wider transition-all duration-150 border ${
                    isActive
                      ? "bg-red-dim/10 border-red-custom/30 text-red-custom font-bold"
                      : "border-transparent text-text-2 hover:bg-bg-3/50 hover:text-text-custom"
                  }`}
                >
                  <span className="text-xs shrink-0">{l.icon}</span>
                  <span>{l.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 mt-auto">
            <Link
              href="/"
              className="flex items-center justify-center gap-2 w-full py-2 bg-bg-2 border border-border-custom text-text-custom hover:bg-bg-3 hover:text-green-custom rounded font-mono text-[0.72rem] font-bold uppercase transition-all duration-150 no-underline"
            >
              ← Back to App
            </Link>
          </div>
        </div>

        {/* Admin profile snippet */}
        <div className="p-4 border-t border-border-custom bg-bg-2/30 flex flex-col gap-1 shrink-0 font-mono text-[0.68rem]">
          <span className="text-text-3 uppercase">Logged as:</span>
          <span className="text-text-custom font-bold">@{user?.username}</span>
          <span className="text-red-custom font-bold uppercase text-[0.6rem]">{user?.role}</span>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-grow flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header */}
        <header className="h-14 border-b border-border-custom bg-bg-1 flex items-center justify-between px-6 shrink-0 font-mono text-xs">
          <div className="text-text-3 uppercase tracking-wider font-bold">// StockPulse Operations Panel</div>
          <div className="flex items-center gap-4">
            <span className="px-2 py-0.5 rounded bg-red-dim/20 text-red-custom font-extrabold text-[0.65rem] tracking-wider uppercase border border-red-custom/25">
              ● SECURE CONSOLE
            </span>
          </div>
        </header>

        {/* Children Render Container */}
        <div className="flex-grow overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
