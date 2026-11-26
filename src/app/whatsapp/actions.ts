"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "../../server/db.ts";
import { sendBrokerMessage } from "../../workflow/messaging.ts";

export async function sendChatMessage(form: FormData) {
  const input = z
    .object({ caseId: z.uuid(), body: z.string().trim().min(1).max(4000) })
    .safeParse({ caseId: form.get("caseId"), body: form.get("body") });
  if (!input.success) redirect("/whatsapp?error=empty");
  await sendBrokerMessage(await getDb(), input.data);
  revalidatePath("/whatsapp");
  revalidatePath(`/cases/${input.data.caseId}`);
  redirect(`/whatsapp?case=${input.data.caseId}`);
}
