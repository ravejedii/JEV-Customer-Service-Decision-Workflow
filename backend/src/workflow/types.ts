import type { OverPromiseCheck } from "../jev/check.js";
import type { TriageAnswers } from "../jev/triage.js";

export type RouteKind = "person" | "auto_reply";

export type RoutePolicy = {
  urgencyThreshold: number;
  frustrationThreshold: number;
  overPromiseThreshold: number;
};

export type RouteDecision = {
  kind: RouteKind;
  reason: string;
  policy: RoutePolicy;
};

export type WorkflowResult = {
  customerMessage: string;
  triage: TriageAnswers;
  route: RouteDecision;
  generated: {
    model: string;
    kind: "handoff_note" | "customer_reply";
    label: string;
    text: string;
  };
  overPromiseCheck: OverPromiseCheck | null;
};
