// Workspace roles, shared by server and client code.
//   owner  – full control, the only role that can add/remove owners and members
//   admin  – Retell connection, settings, team invites, reports, dashboards, syncing
//   user   – your team: every dashboard, call, insight and report, read-only
//   client – the business you built the agent for: analytics, call history and reports

export type Role = "owner" | "admin" | "user" | "client";

export const ROLES: Role[] = ["client", "user", "admin", "owner"];
export const RANK: Record<Role, number> = { client: 0, user: 1, admin: 2, owner: 3 };

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", admin: "Admin", user: "User", client: "Client" };
export const ROLE_DESC: Record<Role, string> = {
  owner: "Everything, including adding and removing members",
  admin: "Settings, Retell connection, team, reports and dashboards",
  user: "All analytics, calls, insights and reports (read-only)",
  client: "Analytics, call history and reports for their business",
};

export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as string[]).includes(v);
export const atLeast = (r: Role, min: Role) => RANK[r] >= RANK[min];

/** Admins and owners can change things; users and clients only look. */
export const canEdit = (r: Role) => atLeast(r, "admin");
/** Insights (root causes, prompt fixes) are internal to your team, so clients don't see them. */
export const canSeeInsights = (r: Role) => atLeast(r, "user");

/** Cookie for "View as": lets admins preview the app as a user or client. It can only lower access. */
export const VIEW_AS_COOKIE = "view_as";

/** Effective UI role: the lower of the member's real role and the "view as" preview. */
export function effectiveRole(actual: Role, viewAs: string | undefined | null): Role {
  if (!isRole(viewAs)) return actual;
  return RANK[viewAs] < RANK[actual] ? viewAs : actual;
}
