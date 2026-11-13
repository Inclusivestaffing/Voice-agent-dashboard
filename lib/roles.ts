// Workspace access. There is one role people see and invite with: Admin.
// The database still stores "owner" for whoever created the workspace (they can't be removed),
// and older rows may say "user" or "client"; every member is treated as an Admin.

export type Role = "owner" | "admin";

export const ROLE_LABEL: Record<Role, string> = { owner: "Admin", admin: "Admin" };

/** Any membership row grants Admin; the creator keeps "owner" so they can't be removed by mistake. */
export const normalizeRole = (dbRole: unknown): Role => (dbRole === "owner" ? "owner" : "admin");

/** Everyone in a workspace can change settings, sync, and generate reports. */
export const canEdit = (role: Role) => role === "owner" || role === "admin";
