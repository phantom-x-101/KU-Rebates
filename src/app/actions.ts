"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { USER_COOKIE } from "@/lib/session";

export async function selectUser(userId: number) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.active) {
    throw new Error("Unknown or inactive user");
  }

  const jar = await cookies();
  jar.set(USER_COOKIE, String(user.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  await audit({
    userId: user.id,
    container: null,
    entity: "session",
    entityId: user.id,
    action: "select_user",
    detail: `role=${user.role}`,
  });

  revalidatePath("/");
}
