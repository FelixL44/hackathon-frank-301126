import { z } from "zod";

export const RequestTopic = z.enum(["clearer_photo", "corrected_estimate", "policy_details", "other"]);

export const REQUEST_TOPICS: Record<z.infer<typeof RequestTopic>, { label: string; text: string }> = {
  clearer_photo: {
    label: "Ask for a clearer photo",
    text: "Pode enviar uma fotografia mais nítida da zona danificada, tirada com boa luz e de forma a identificar a parte do veículo?",
  },
  corrected_estimate: {
    label: "Ask for a corrected estimate",
    text: "Pode confirmar com a oficina se o orçamento corresponde à zona danificada e enviar uma versão corrigida, se for necessário?",
  },
  policy_details: {
    label: "Ask for policy details",
    text: "Pode confirmar o número da apólice e a matrícula do veículo?",
  },
  other: { label: "Write a custom request", text: "" },
};

export function requestDraft(reference: string, topic: z.infer<typeof RequestTopic>, instruction: string) {
  const body = instruction || REQUEST_TOPICS[topic].text;
  return `Olá,\n\nEstamos a rever o seu processo ${reference}. Para podermos dar seguimento à participação, precisamos da sua ajuda.\n\n${body}\n\nAgradecemos a sua colaboração.\nEquipa de gestão de sinistros`;
}

export const draftKey = (revision: number) => `broker-draft:${revision}:`;
export const SENT_REQUEST_PREFIX = "broker-sent:";
export const sentKey = (revision: number) => `${SENT_REQUEST_PREFIX}${revision}:`;
