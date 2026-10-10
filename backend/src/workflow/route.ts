import { config } from "../config.js";
import type { TriageAnswers } from "../jev/triage.js";
import type { RouteDecision, RoutePolicy } from "./types.js";

function policy(): RoutePolicy {
  return {
    urgencyThreshold: config.urgencyThreshold,
    frustrationThreshold: config.frustrationThreshold,
    overPromiseThreshold: config.overPromiseThreshold,
  };
}

function person(reason: string): RouteDecision {
  return { kind: "person", reason, policy: policy() };
}

/**
 * Escalation is fail-closed. A missing or out-of-range score goes to a
 * person. Urgency is checked before frustration so a calm but time-critical
 * ticket still escalates, and the reason names the rule that fired.
 */
export function decideRoute(triage: TriageAnswers): RouteDecision {
  const urgency = triage.isUrgent;
  const frustration = triage.frustration.score;
  const rules = policy();

  if (!Number.isFinite(urgency) || !Number.isFinite(frustration)) {
    return person(
      "Urgency or frustration was not a finite score, so a person reviews the ticket",
    );
  }

  if (urgency < 0 || urgency > 1) {
    return person("Urgency was outside 0–1, so a person reviews the ticket");
  }

  if (frustration < 0 || frustration > 2) {
    return person(
      "Frustration was outside 0–2, so a person reviews the ticket",
    );
  }

  if (urgency >= rules.urgencyThreshold) {
    return person(
      `Urgency ${urgency.toFixed(2)} is at least ${rules.urgencyThreshold}`,
    );
  }

  if (frustration >= rules.frustrationThreshold) {
    return person(
      `Frustration ${frustration.toFixed(2)} is at least ${rules.frustrationThreshold}`,
    );
  }

  return {
    kind: "auto_reply",
    reason: `Urgency ${urgency.toFixed(2)} and frustration ${frustration.toFixed(2)} are below the escalation cuts`,
    policy: rules,
  };
}
