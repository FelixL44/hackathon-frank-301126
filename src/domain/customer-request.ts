import { z } from "zod";
import { LANGUAGES, type Language } from "./language.ts";

export const RequestTopic = z.enum(["clearer_photo", "corrected_estimate", "policy_details", "other"]);

/** Broker-facing labels (the UI is English); the message texts live per language in language.ts. */
export const REQUEST_TOPICS: Record<z.infer<typeof RequestTopic>, { label: string }> = {
  clearer_photo: { label: "Ask for a clearer photo" },
  corrected_estimate: { label: "Ask for a corrected estimate" },
  policy_details: { label: "Ask for policy details" },
  other: { label: "Write a custom request" },
};

export function requestDraft(language: Language, reference: string, topic: z.infer<typeof RequestTopic>, instruction: string) {
  const pack = LANGUAGES[language];
  const body = instruction || (topic === "other" ? "" : pack.requestText[topic]);
  return pack.requestDraft(reference, body);
}

export const draftKey = (revision: number) => `broker-draft:${revision}:`;
export const SENT_REQUEST_PREFIX = "broker-sent:";
export const sentKey = (revision: number) => `${SENT_REQUEST_PREFIX}${revision}:`;
