// Lightweight customer session for the demo website: the cookie carries a signed customer id, no password.
// shortcut: real customer authentication (magic link / WhatsApp OTP) before any public deployment.
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { customers } from "../db/schema.ts";

const COOKIE = "frank_customer";
const MAX_AGE = 60 * 60 * 24 * 14;

function secret(env: Record<string, string | undefined> = process.env) {
  return env.SESSION_SECRET?.trim() || `frank-customer:${env.ADMIN_PASSWORD?.trim() || "frank-admin"}`;
}

function sign(id: string) {
  return createHmac("sha256", secret()).update(id).digest("hex");
}

function verify(value: string) {
  const [id, signature] = value.split(".");
  if (!id || !signature) return null;
  const expected = sign(id);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right) ? id : null;
}

export async function customerSessionId() {
  const value = (await cookies()).get(COOKIE)?.value;
  return value ? verify(value) : null;
}

export async function setCustomerSession(id: string) {
  (await cookies()).set(COOKIE, `${id}.${sign(id)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearCustomerSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentCustomer(db: Db) {
  const id = await customerSessionId();
  if (!id) return null;
  const [customer] = await db.select().from(customers).where(eq(customers.id, id));
  return customer ?? null;
}
