// File forms post here rather than to a Server Action: Next caps Server Action request bodies at 1 MB by
// default, while a customer photo may be up to 10 MB. The shared helpers validate the session and ownership,
// then return where to go so this handler can answer with a 303 (a POST must not be replayed on the redirect).
import { revalidatePath } from "next/cache";
import { submitClaim, submitEvidence } from "../claims.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const formData = await request.formData();
  const location =
    formData.get("intent") === "evidence" ? await submitEvidence(formData) : await submitClaim(formData);
  revalidatePath("/customer", "layout");
  return new Response(null, { status: 303, headers: { Location: location } });
}
