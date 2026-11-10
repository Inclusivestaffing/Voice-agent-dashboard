"use client";

import { useApp } from "@/components/context/AppContext";
import { ROLE_LABEL, ROLE_DESC, type Role } from "@/lib/roles";
import { Card, cx } from "@/components/ui";

const ROLES_LIST: Role[] = ["admin", "user", "client"];

export default function RoleControlsCard({
  email = "admin@inclusivestaffing.com",
  name = "Inclusive Staffing",
}: {
  email?: string;
  name?: string;
}) {
  const { role, setRole } = useApp();

  return (
    <Card
      title="Account & Access Controls"
      sub="Manage account permissions and preview the portal as different roles"
    >
      <div className="space-y-5">
        {/* Account summary */}
        <div className="flex items-center gap-3 p-3.5 bg-slate-50 border border-slate-200/70 rounded-2xl">
          <div className="h-10 w-10 rounded-2xl bg-slate-900 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-card">
            IS
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-900 truncate">{name}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-900 text-white">
                {ROLE_LABEL[role]}
              </span>
            </div>
            <div className="text-xs text-slate-500 truncate">{email}</div>
          </div>
        </div>

        {/* Role Controls Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Switch Active Role (Preview Mode)
          </label>

          <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
            role="group"
            aria-label="Account role controls"
          >
            {ROLES_LIST.map((r) => {
              const isSelected = role === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cx(
                    "p-3 rounded-2xl border text-left transition flex flex-col justify-between gap-2 shadow-card group",
                    isSelected
                      ? "border-slate-900 bg-slate-900 text-white shadow-xs"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-800"
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-sm tracking-tight">{ROLE_LABEL[r]}</span>
                    <span
                      className={cx(
                        "w-4 h-4 rounded-full border flex items-center justify-center text-[10px]",
                        isSelected
                          ? "border-white bg-white text-slate-900"
                          : "border-slate-300 group-hover:border-slate-400"
                      )}
                    >
                      {isSelected ? "✓" : ""}
                    </span>
                  </div>
                  <p
                    className={cx(
                      "text-xs leading-relaxed",
                      isSelected ? "text-slate-300" : "text-slate-500"
                    )}
                  >
                    {ROLE_DESC[r]}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Explanatory role badge notes */}
        <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3.5 space-y-2 text-xs text-slate-600">
          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
            <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>Role Permissions Breakdown</span>
          </div>
          <ul className="space-y-1.5 pl-5 list-disc text-slate-500">
            <li>
              <strong className="text-slate-800 font-medium">Admin:</strong> Full control over settings, Retell API keys, webhooks, team invites, and report exports.
            </li>
            <li>
              <strong className="text-slate-800 font-medium">User:</strong> Internal staff view. Access to Analytics, Call History, Insights root causes, and Reports (read-only).
            </li>
            <li>
              <strong className="text-slate-800 font-medium">Client:</strong> Client portal access. Direct access to Analytics, Call History, and Reports. Internal prompt fixes and engineering insights are hidden.
            </li>
          </ul>
        </div>
      </div>
    </Card>
  );
}

