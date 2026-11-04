import type { User, UserRole } from "@/db/schema";

const SETTINGS_ROLES: UserRole[] = ["admin", "supply_chain"];

export function canManageSettings(user: User | null | undefined): boolean {
  if (!user || !user.active) return false;
  return SETTINGS_ROLES.includes(user.role as UserRole);
}

export function assertCanManageSettings(user: User | null | undefined): User {
  if (!canManageSettings(user)) {
    throw new Error("Settings require admin or supply_chain role");
  }
  return user as User;
}
