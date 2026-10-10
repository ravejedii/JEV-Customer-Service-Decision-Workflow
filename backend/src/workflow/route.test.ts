import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TriageAnswers } from "../jev/triage.js";
import { decideRoute } from "./route.js";

function triage(urgency: number, frustration: number): TriageAnswers {
  return {
    model: "jev-test",
    department: {
      choice: "billing",
      confidence: 0.91,
      probabilities: { billing: 0.91, technical: 0.06, sales: 0.03 },
    },
    frustration: {
      score: frustration,
      confidence: 0.8,
      legend: {
        "0": "Calm, just stating facts",
        "1": "Frustrated but civil",
        "2": "Very angry, strong language",
      },
      probabilities: { "0": 0.05, "1": 0.15, "2": 0.8 },
    },
    isUrgent: urgency,
  };
}

describe("decideRoute", () => {
  it("sends a time-critical ticket to a person even when the tone is calm", () => {
    const decision = decideRoute(triage(0.7, 0));
    assert.equal(decision.kind, "person");
    assert.match(decision.reason, /Urgency 0\.70/);
    assert.equal(decision.policy.urgencyThreshold, 0.7);
  });

  it("names urgency when both cuts are crossed", () => {
    const decision = decideRoute(triage(0.91, 2));
    assert.equal(decision.kind, "person");
    assert.match(decision.reason, /^Urgency/);
  });

  it("escalates very angry tickets that are not urgent", () => {
    const decision = decideRoute(triage(0.2, 2));
    assert.equal(decision.kind, "person");
    assert.match(decision.reason, /Frustration 2\.00/);
    assert.equal(decision.policy.frustrationThreshold, 2);
  });

  it("auto-replies when both scores stay under the cuts", () => {
    const decision = decideRoute(triage(0.69, 1));
    assert.equal(decision.kind, "auto_reply");
    assert.match(decision.reason, /below the escalation cuts/);
    assert.equal(decision.policy.overPromiseThreshold, 0.7);
  });

  it("fails closed when a score is missing or out of range", () => {
    for (const input of [
      triage(Number.NaN, 0),
      triage(0.2, Number.POSITIVE_INFINITY),
      triage(-0.01, 0),
      triage(1.01, 0),
      triage(0.2, -0.1),
      triage(0.2, 2.1),
    ]) {
      assert.equal(decideRoute(input).kind, "person");
    }
  });
});
