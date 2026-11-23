// Decision policy from CLAUDE.md as data: first matching rule wins. HAC-9 extends the inputs, not the shape.
import type { CaseStatus, FindingRule, SideEffect } from "./schema.ts";

export type DecisionRule = {
  name: string; // shown to the broker as "why the agent did this"
  when: (openRules: readonly FindingRule[]) => boolean;
  status: CaseStatus;
  action: SideEffect;
};

const any = (...rules: FindingRule[]) => (open: readonly FindingRule[]) => open.some((r) => rules.includes(r));

// The fourth CLAUDE.md row (broker approves → submitting) is a broker action, handled in workflow/cases.ts approve().
export const DECISION_TABLE: readonly DecisionRule[] = [
  {
    name: "Sources disagree or model output is invalid: broker decides",
    when: any("conflict", "invalid_extraction"),
    status: "broker_review",
    action: "create_broker_task",
  },
  {
    name: "Required information missing, illegible or ambiguous: ask one question",
    when: any("missing", "illegible", "ambiguous"),
    status: "awaiting_information",
    action: "request_information",
  },
  {
    name: "All checks pass: prepare filing for approval",
    when: () => true,
    status: "awaiting_approval",
    action: "prepare_filing",
  },
];

export const decide = (openRules: readonly FindingRule[]): DecisionRule => DECISION_TABLE.find((r) => r.when(openRules))!;
