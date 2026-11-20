import { db } from "@/db";
import { users } from "@/db/schema";

/** Keeps a row for each person, keyed by the Gateway's user id; the email follows the identity. */
export async function rememberUser(user: { id: string; email: string }) {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email })
    .onConflictDoUpdate({ target: users.id, set: { email: user.email } });
}
