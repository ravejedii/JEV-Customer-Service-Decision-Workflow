import { checkOverPromise } from "../jev/check.js";
import { triageMessage } from "../jev/triage.js";
import { writeDraft } from "../reply/nvidia.js";
import { decideRoute } from "./route.js";
import type { WorkflowResult } from "./types.js";
import { normalizeMessage } from "./validate.js";

export async function runWorkflow(message: string): Promise<WorkflowResult> {
  const customerMessage = normalizeMessage(message);

  const triage = await triageMessage(customerMessage);
  const route = decideRoute(triage);

  const generated = await writeDraft({
    customerMessage,
    department: triage.department.choice,
    route: route.kind,
    frustrationScore: triage.frustration.score,
    urgency: triage.isUrgent,
  });

  if (route.kind === "person") {
    return {
      customerMessage,
      triage,
      route,
      generated: {
        model: generated.model,
        kind: "handoff_note",
        label: "Internal handoff note (not sent to customer)",
        text: generated.text,
      },
      overPromiseCheck: null,
    };
  }

  const overPromiseCheck = await checkOverPromise(
    customerMessage,
    generated.text,
  );

  return {
    customerMessage,
    triage,
    route,
    generated: {
      model: generated.model,
      kind: "customer_reply",
      label: overPromiseCheck.heldForReview
        ? "Customer reply draft (held for review)"
        : "Customer reply",
      text: generated.text,
    },
    overPromiseCheck,
  };
}
