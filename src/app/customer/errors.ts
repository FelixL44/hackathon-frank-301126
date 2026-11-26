// Readable copy for the `?error=` codes the customer actions redirect with.
export const ERROR_TEXT: Record<string, string> = {
  session: "Your session ended. Enter your details to continue.",
  details: "Enter your name and a phone number or email address.",
  contact: "Use a phone number or an email address your broker can reach.",
  demo: "That demo customer is no longer available. Pick another one or enter your details.",
  agent: "Choose a claim type before continuing.",
  description: "Describe what happened in at least a sentence.",
  date: "Enter a valid incident date, or leave it blank.",
  no_files: "Choose at least one photo or document.",
  too_many: "Add at most 8 files at once.",
  file_type: "Use JPG, PNG, WebP, PDF or TXT files.",
  file_size: "Each file must be 10 MB or smaller.",
  file_empty: "One of the files is empty. Choose another one.",
  claim_failed: "We could not open the claim. Check the details and try again.",
  message: "Write a message before sending.",
  upload_failed: "We could not add those files. Try again.",
  not_ready: "This claim was already forwarded. Our broker records any further correspondence.",
  not_found: "That claim could not be found in your account.",
};

/** A readable message for a `?error=` value, or null when there is no error. */
export function errorText(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return ERROR_TEXT[value] ?? "Something went wrong. Please try again.";
}
