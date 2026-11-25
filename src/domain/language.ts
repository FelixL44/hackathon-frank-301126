// All language-specific text in one place (HAC-34). The app writes in APP_LANGUAGE (default English);
// evidence may arrive in any language listed here, so direction words of every language are checked.
import { z } from "zod";
import type { Position } from "./schema.ts";

export const Language = z.enum(["en", "pt"]);
export type Language = z.infer<typeof Language>;

/** The language the app writes in (drafted customer messages). Unknown or unset values fall back to English. */
export const appLanguage = (env: Record<string, string | undefined>): Language => Language.catch("en").parse(env.APP_LANGUAGE);

type Topic = "clearer_photo" | "corrected_estimate" | "policy_details";

type LanguagePack = {
  /** Words that name a side of the vehicle, matched against lowercased quotes. */
  directionWords: [RegExp, Position][];
  requestText: Record<Topic, string>;
  requestDraft: (reference: string, body: string) => string;
};

export const LANGUAGES: Record<Language, LanguagePack> = {
  en: {
    directionWords: [
      [/\bfront/, "front"],
      [/\b(rear|back)\b/, "rear"],
      [/\bleft\b/, "left"],
      [/\bright\b/, "right"],
    ],
    requestText: {
      clearer_photo: "Could you send a sharper photo of the damaged area, taken in good light, that shows which part of the vehicle it is?",
      corrected_estimate: "Could you check with the workshop whether the estimate matches the damaged area and, if needed, send a corrected version?",
      policy_details: "Could you confirm your policy number and the vehicle's licence plate?",
    },
    requestDraft: (reference, body) =>
      `Hello,\n\nWe are reviewing your claim ${reference}. To move it forward we need your help.\n\n${body}\n\nThank you.\nClaims team`,
  },
  pt: {
    directionWords: [
      [/dianteir/, "front"],
      [/traseir/, "rear"],
      [/esquerd/, "left"],
      [/direit/, "right"],
    ],
    requestText: {
      clearer_photo: "Pode enviar uma fotografia mais nítida da zona danificada, tirada com boa luz e de forma a identificar a parte do veículo?",
      corrected_estimate: "Pode confirmar com a oficina se o orçamento corresponde à zona danificada e enviar uma versão corrigida, se for necessário?",
      policy_details: "Pode confirmar o número da apólice e a matrícula do veículo?",
    },
    requestDraft: (reference, body) =>
      `Olá,\n\nEstamos a rever o seu processo ${reference}. Para podermos dar seguimento à participação, precisamos da sua ajuda.\n\n${body}\n\nAgradecemos a sua colaboração.\nEquipa de gestão de sinistros`,
  },
};

/** Direction words of every supported language: a Portuguese estimate is checked even when the app writes English. */
export const ALL_DIRECTION_WORDS = Object.values(LANGUAGES).flatMap((l) => l.directionWords);
