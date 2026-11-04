import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users, type User } from "@/db/schema";

export const USER_COOKIE = "ku_user_id";

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const raw = jar.get(USER_COOKIE)?.value;
  if (!raw) return null;
  const id = Number(raw);
  if (!Number.isFinite(id)) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export async function listUsers(): Promise<User[]> {
  const db = getDb();
  return db.select().from(users).where(eq(users.active, 1));
}
