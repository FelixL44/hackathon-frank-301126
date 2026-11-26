"use server";

// Server actions for the customer website. Every mutation re-reads the signed-in customer from the cookie and
// ownership-checks the case through `customerCase`, never trusting an id from the URL or the form.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { customers } from "../../db/schema.ts";
import { clearCustomerSession, setCustomerSession } from "../../server/customer-session.ts";
import { getDb } from "../../server/db.ts";
import { WorkflowError } from "../../workflow/cases.ts";
import { activeAgents, customerCase } from "../../workflow/customer-intake.ts";
import { sendCustomerMessage } from "../../workflow/messaging.ts";
import { customerContext, newClaimHref, submitClaim, submitEvidence } from "./claims.ts";

const Contact = z.object({
  name: z.string().trim().min(2).max(120),
  contact: z
    .string()
    .trim()
    .min(5)
    .max(200)
    .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /^\+?[\d\s().-]{5,}$/.test(value)),
});

/** Find or create the web customer for this name/contact pair, then start the demo session. */
export async function startSession(formData: FormData) {
  const parsed = Contact.safeParse({ name: formData.get("name"), contact: formData.get("contact") });
  if (!parsed.success) redirect(`/customer?error=${parsed.error.issues[0]?.path[0] === "name" ? "details" : "contact"}`);

  const db = await getDb();
  const [customer] = await db
    .insert(customers)
    .values({ name: parsed.data.name, channel: "web", address: parsed.data.contact })
    .onConflictDoUpdate({ target: [customers.channel, customers.address], set: { name: parsed.data.name } })
    .returning();
  await setCustomerSession(customer!.id);
  revalidatePath("/customer");
  redirect("/customer");
}

/** One-click access to a seeded demo customer from the landing page. */
export async function demoLogin(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("customerId"));
  if (!id.success) redirect("/customer?error=demo");
  const db = await getDb();
  const [customer] = await db.select().from(customers).where(eq(customers.id, id.data));
  if (!customer) redirect("/customer?error=demo");
  await setCustomerSession(customer.id);
  revalidatePath("/customer");
  redirect("/customer");
}

export async function signOut() {
  await clearCustomerSession();
  revalidatePath("/customer");
  redirect("/customer");
}

/** Step 1 → 2: keep only the chosen claim type in the URL. */
export async function chooseAgent(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("agent"));
  if (!id.success) redirect(newClaimHref({ step: 1, error: "agent" }));
  const db = await getDb();
  const agent = (await activeAgents(db)).find((row) => row.id === id.data);
  if (!agent) redirect(newClaimHref({ step: 1, error: "agent" }));
  redirect(newClaimHref({ step: 2, agent: agent.id }));
}

/** Step 2 → 3: validate the description, then carry it to the review step. */
export async function describeIncident(formData: FormData) {
  const agentId = z.uuid().safeParse(formData.get("agent"));
  if (!agentId.success) redirect(newClaimHref({ step: 1, error: "agent" }));
  const date = String(formData.get("date") ?? "").trim();
  const rawMessage = String(formData.get("message") ?? "");
  const parsed = z
    .object({ message: z.string().trim().min(10).max(4000), date: z.iso.date().or(z.literal("")) })
    .safeParse({ message: formData.get("message"), date });
  if (!parsed.success) {
    const code = parsed.error.issues.some((issue) => issue.path[0] === "date") ? "date" : "description";
    redirect(newClaimHref({ step: 2, agent: agentId.data, message: rawMessage.trim(), date, error: code }));
  }
  redirect(
    newClaimHref({
      step: 3,
      agent: agentId.data,
      message: parsed.data.message,
      date: parsed.data.date || undefined,
    }),
  );
}

/** Step 3: open the case with the chosen claim type, description and evidence. */
export async function createClaim(formData: FormData) {
  const location = await submitClaim(formData);
  revalidatePath("/customer", "layout");
  redirect(location);
}

/** Add photos/documents to an existing case; this creates a new revision and re-runs extraction. */
export async function uploadEvidence(formData: FormData) {
  const location = await submitEvidence(formData);
  revalidatePath("/customer", "layout");
  redirect(location);
}

/** Send a text message from the customer into the case thread. */
export async function postMessage(formData: FormData) {
  const context = await customerContext();
  if (!context.customer) redirect("/customer?error=session");
  const { db, customer } = context;

  const caseId = z.uuid().safeParse(formData.get("caseId"));
  const body = z.string().trim().min(1).max(4000).safeParse(formData.get("body"));
  if (!caseId.success) redirect("/customer?error=not_found");
  const href = `/customer/cases/${caseId.data}`;

  if (!body.success) redirect(`${href}?error=message`);
  if (!(await customerCase(db, customer.id, caseId.data))) redirect("/customer?error=not_found");

  try {
    await sendCustomerMessage(db, { caseId: caseId.data, customerId: customer.id, body: body.data });
  } catch (error) {
    if (error instanceof WorkflowError) redirect(`${href}?error=message`);
    throw error;
  }
  revalidatePath(href);
  revalidatePath("/customer");
  redirect(href);
}
