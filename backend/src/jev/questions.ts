import { choice, noul, score } from "@typesafe-ai/sdk";
import { AppError } from "../errors.js";

/** Official quick-start triage questions, asked together in one call. */
export function triageQuestions() {
  return {
    department: choice("Which team should handle this", {
      billing: "Payment or subscription issues",
      technical: "Bugs or integration problems",
      sales: "Pricing or account questions",
    }),
    frustration: score("How frustrated the customer appears", [
      "Calm, just stating facts",
      "Frustrated but civil",
      "Very angry, strong language",
    ]),
    is_urgent: noul("The message conveys urgency or time-sensitivity"),
  };
}

export function overPromiseQuestions() {
  return {
    over_promises: noul(
      "Does this support reply promise money back, a specific deadline, or a confirmed fix that was not verified?",
      {
        true:
          "Promises a refund, credit, delivery date, resolution time, or that the issue is fixed",
        false:
          "Acknowledges the issue, names a team, or asks for details without committing to a remedy",
      },
    ),
  };
}

export const DEPARTMENTS = ["billing", "technical", "sales"] as const;

export type Department = (typeof DEPARTMENTS)[number];

export function readDepartment(value: string): Department {
  if ((DEPARTMENTS as readonly string[]).includes(value)) {
    return value as Department;
  }
  throw new AppError(`Jev returned an unexpected department: ${value}`, 502);
}
