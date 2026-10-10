import { TypeSafeClient } from "@typesafe-ai/sdk";
import { config } from "../config.js";
import { readDepartment, triageQuestions, type Department } from "./questions.js";

export type TriageAnswers = {
  model: string;
  department: {
    choice: Department;
    confidence: number;
    probabilities: Record<string, number>;
  };
  frustration: {
    score: number;
    confidence: number;
    legend: Record<string, string>;
    probabilities: Record<string, number>;
  };
  isUrgent: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

export async function triageMessage(message: string): Promise<TriageAnswers> {
  const client = new TypeSafeClient({ apiKey: config.typesafeApiKey() });
  const response = await client.systemOne({
    model: "jev-latest",
    state: message,
    questions: triageQuestions(),
  });

  const { department, frustration, is_urgent: isUrgent } = response.answers;

  return {
    model: response.model,
    department: {
      choice: readDepartment(String(department.choice)),
      confidence: department.confidence,
      probabilities: department.probabilities,
    },
    frustration: {
      score: frustration.score,
      confidence: frustration.confidence,
      legend: frustration.legend,
      probabilities: frustration.probabilities,
    },
    isUrgent: isUrgent.noul,
    usage: response.usage,
  };
}
