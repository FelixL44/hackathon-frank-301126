// Admin gate for the hackathon demo: one password, one signed cookie, no user table.
// shortcut: replace with the team's identity provider before any real use.
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "frank_admin";
const SUBJECT = "frank-admin";
const MAX_AGE = 60 * 60 * 12; // one working day

export function adminPassword(env: Record<string, string | undefined> = process.env) {
  return env.ADMIN_PASSWORD?.trim() || "frank-admin";
}

export function usingDefaultPassword(env: Record<string, string | undefined> = process.env) {
  return !env.ADMIN_PASSWORD?.trim();
}

function expectedToken(env: Record<string, string | undefined> = process.env) {
  return createHmac("sha256", `frank-admin:${adminPassword(env)}`).update(SUBJECT).digest("hex");
}

function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function isAdmin() {
  const value = (await cookies()).get(COOKIE)?.value;
  return Boolean(value && equal(value, expectedToken()));
}

/** Returns false for a wrong password; the login page shows one generic message. */
export async function signInAdmin(password: string) {
  const given = createHmac("sha256", password).digest("hex");
  const wanted = createHmac("sha256", adminPassword()).digest("hex");
  if (!equal(given, wanted)) return false;
  (await cookies()).set(COOKIE, expectedToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  return true;
}

export async function signOutAdmin() {
  (await cookies()).delete(COOKIE);
}

/** Server-side page guard; the login page lives outside the guarded route group. */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}
