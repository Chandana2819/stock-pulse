"use client";

import Link from "next/link";

const ROLE_PERMISSIONS_DETAILS = [
  {
    role: "SUPER_ADMIN",
    description: "Full configuration and administrative permissions. Access to financial adjustment actions, system configurations, audits, and settings consoles.",
  },
  {
    role: "ADMIN",
    description: "Standard operational permissions. Manage user status, KYC files, support tickets, and publish learning materials. No wallet adjustments or settings modification rights.",
  },
  {
    role: "KYC_ADMIN",
    description: "Isolated compliance check permission. Access restricted strictly to the KYC review desk queue.",
  },
  {
    role: "CONTENT_ADMIN",
    description: "Educational and community moderator. Manage learning article publisher and hide community posts.",
  },
  {
    role: "SUPPORT_ADMIN",
    description: "Support dispatcher role. Access to the support tickets desk and user account suspend toggles.",
  },
];

export default function AdminSettingsPage() {
  return (
    <div className="p-6 sm:p-8 flex flex-col gap-6 animate-card-enter">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-border-custom pb-4">
        <div>
          <h1 className="font-display text-xl tracking-[0.1em] text-red-custom uppercase">
            Security & Controls Settings
          </h1>
          <p className="font-mono text-[0.65rem] text-text-3 mt-1 uppercase">
            Manage administrative consoles, review permission structures, and audit operations
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start font-mono text-xs">
        {/* Navigation panel */}
        <div className="lg:col-span-4 border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-4">
          <h3 className="text-xs font-bold text-text-custom uppercase border-b border-border-custom pb-2">// Operational Logs</h3>
          <p className="text-text-3 leading-relaxed">
            Every administrative wallet adjustment, role changes, KYC status adjustments, and post deletion actions are audited and recorded in the append-only logs.
          </p>
          <Link
            href="/admin/settings/audit-logs"
            className="w-full text-center py-2.5 bg-red-custom hover:bg-opacity-95 text-bg font-bold uppercase rounded no-underline transition-all duration-150 inline-block"
          >
            Open System Audit Logs →
          </Link>
        </div>

        {/* Roles Details Card */}
        <div className="lg:col-span-8 border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-4">
          <h3 className="text-xs font-bold text-text-custom uppercase border-b border-border-custom pb-2">// Defined Access Role Ranks</h3>
          <div className="flex flex-col gap-3">
            {ROLE_PERMISSIONS_DETAILS.map((r, idx) => (
              <div key={idx} className="bg-bg-2/30 p-3.5 border border-border-custom rounded flex flex-col gap-1.5">
                <span className="font-bold text-red-custom uppercase tracking-wider">{r.role}</span>
                <p className="text-text-2 leading-relaxed text-[0.68rem]">{r.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
