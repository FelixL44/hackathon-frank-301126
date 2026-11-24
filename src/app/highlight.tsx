import type { ReactNode } from "react";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Marks the first occurrence of `quote` in `text`, ignoring case and whitespace differences (PDF text layers vary). */
export function Highlight({ text, quote }: { text: string; quote?: string }): ReactNode {
  const words = quote?.trim().slice(0, 200).split(/\s+/).filter(Boolean) ?? [];
  const match = words.length ? new RegExp(words.map(escape).join("\\s+"), "i").exec(text) : null;
  if (!match) return text;
  return (
    <>
      {text.slice(0, match.index)}
      <mark>{match[0]}</mark>
      {text.slice(match.index + match[0].length)}
    </>
  );
}
