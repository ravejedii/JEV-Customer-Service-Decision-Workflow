import { TypeSafeClient } from "@typesafe-ai/sdk";
import { config } from "../config.js";
import { overPromiseQuestions } from "./questions.js";

export type OverPromiseCheck = {
  model: string;
  probability: number;
  heldForReview: boolean;
};

export async function checkOverPromise(
  customerMessage: string,
  draftReply: string,
): Promise<OverPromiseCheck> {
  const client = new TypeSafeClient({ apiKey: config.typesafeApiKey() });
  const response = await client.systemOne({
    model: "jev-latest",
    state: {
      customer_message: customerMessage,
      draft_reply: draftReply,
    },
    questions: overPromiseQuestions(),
  });

  const probability = response.answers.over_promises.noul;
  return {
    model: response.model,
    probability,
    heldForReview: probability >= config.overPromiseThreshold,
  };
}
