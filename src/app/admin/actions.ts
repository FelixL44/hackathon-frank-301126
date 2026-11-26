"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Db } from "../../db/client.ts";
import { agents } from "../../db/schema.ts";
import { requireAdmin, signInAdmin, signOutAdmin } from "../../server/auth.ts";
import { getDb } from "../../server/db.ts";
import { saveIntegrationFields } from "../../server/settings.ts";

const SLUG = /^[a-z0-9-]{2,40}$/;

/** Comma-separated form field → trimmed, de-duplicated list. */
const listField = z
  .string()
  .max(1000)
  .default("")
  .transform((value) => [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.slice(0, 120)),
    ),
  ]);

const AgentInput = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().regex(SLUG),
  description: z.string().trim().max(500).default(""),
  prompt: z.string().trim().max(5000).default(""),
  requiredFields: listField,
  requiredDocuments: listField,
  sortOrder: z.coerce.number().int().min(0).max(999),
});

/** Postgres unique violation, either on the error or on its cause (driver dependent). */
function uniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; cause?: { code?: unknown } };
  return e.code === "23505" || e.cause?.code === "23505";
}

async function slugTaken(db: Db, slug: string, exceptId?: string) {
  const where = exceptId ? and(eq(agents.slug, slug), ne(agents.id, exceptId)) : eq(agents.slug, slug);
  const [row] = await db.select({ id: agents.id }).from(agents).where(where).limit(1);
  return Boolean(row);
}

export async function signIn(form: FormData) {
  const password = z.string().min(1).max(200).safeParse(form.get("password"));
  if (!password.success) redirect("/admin/login?error=1");
  if (!(await signInAdmin(password.data))) redirect("/admin/login?error=1");
  revalidatePath("/admin");
  redirect("/admin");
}

export async function signOut() {
  await signOutAdmin();
  revalidatePath("/admin");
  redirect("/admin/login");
}

export async function saveIntegrations(form: FormData) {
  await requireAdmin();
  try {
    await saveIntegrationFields(await getDb(), form);
  } catch {
    redirect("/admin/integrations?error=save");
  }
  revalidatePath("/admin/integrations");
  revalidatePath("/admin");
  revalidatePath("/whatsapp");
  redirect("/admin/integrations?saved=1");
}

export async function createAgent(form: FormData) {
  await requireAdmin();
  const input = AgentInput.safeParse(Object.fromEntries(form));
  if (!input.success) redirect("/admin/agents?error=invalid");

  const db = await getDb();
  if (await slugTaken(db, input.data.slug)) redirect("/admin/agents?error=slug");

  let id: string | undefined;
  try {
    const [row] = await db.insert(agents).values(input.data).returning({ id: agents.id });
    id = row?.id;
  } catch (error) {
    if (uniqueViolation(error)) redirect("/admin/agents?error=slug");
    throw error;
  }
  if (!id) redirect("/admin/agents?error=invalid");

  revalidatePath("/admin/agents");
  revalidatePath("/admin");
  redirect(`/admin/agents/${id}?saved=1`);
}

export async function updateAgent(form: FormData) {
  await requireAdmin();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) redirect("/admin/agents?error=missing");

  const db = await getDb();

  // Pause/activate is its own intent: pausing is the archive action, nothing is deleted.
  if (form.get("intent") === "status") {
    const status = z.enum(["active", "paused"]).safeParse(form.get("status"));
    if (!status.success) redirect(`/admin/agents/${id.data}?error=invalid`);
    let found = false;
    try {
      const rows = await db
        .update(agents)
        .set({ status: status.data, updatedAt: new Date() })
        .where(eq(agents.id, id.data))
        .returning({ id: agents.id });
      found = rows.length > 0;
    } catch (error) {
      if (uniqueViolation(error)) redirect(`/admin/agents/${id.data}?error=slug`);
      throw error;
    }
    if (!found) redirect("/admin/agents?error=missing");
    revalidatePath("/admin/agents");
    revalidatePath(`/admin/agents/${id.data}`);
    revalidatePath("/admin");
    redirect(`/admin/agents/${id.data}?saved=1`);
  }

  const input = AgentInput.safeParse(Object.fromEntries(form));
  if (!input.success) redirect(`/admin/agents/${id.data}?error=invalid`);
  if (await slugTaken(db, input.data.slug, id.data)) redirect(`/admin/agents/${id.data}?error=slug`);

  let found = false;
  try {
    const rows = await db
      .update(agents)
      .set({ ...input.data, updatedAt: new Date() })
      .where(eq(agents.id, id.data))
      .returning({ id: agents.id });
    found = rows.length > 0;
  } catch (error) {
    if (uniqueViolation(error)) redirect(`/admin/agents/${id.data}?error=slug`);
    throw error;
  }
  if (!found) redirect("/admin/agents?error=missing");

  revalidatePath("/admin/agents");
  revalidatePath(`/admin/agents/${id.data}`);
  revalidatePath("/admin");
  redirect(`/admin/agents/${id.data}?saved=1`);
}
