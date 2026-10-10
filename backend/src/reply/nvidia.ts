import { config } from "../config.js";
import type { Department } from "../jev/questions.js";
import type { RouteKind } from "../workflow/types.js";
import { draftPrompt, type DraftPromptInput } from "./prompt.js";

type ChatMessage = {
  content?: string | null;
  reasoning_content?: string | null;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: ChatMessage;
    finish_reason?: string | null;
  }>;
  error?: { message?: string };
  usage?: {
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
};

function extractText(message: ChatMessage | undefined): string {
  const content = message?.content?.trim() ?? "";
  if (content) return content;

  // Some catalog models put the whole token budget into reasoning_content
  // and leave content empty. The last paragraph is the draft, when there is one.
  const reasoning = message?.reasoning_content?.trim() ?? "";
  if (!reasoning) return "";

  const parts = reasoning
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.at(-1) ?? reasoning;
}

async function chatOnce(
  input: DraftPromptInput,
  signal: AbortSignal,
): Promise<{ model: string; text: string }> {
  const model = config.nvidiaModel;
  const { system, user } = draftPrompt(input);

  const response = await fetch(`${config.nvidiaBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.nvidiaApiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    signal,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: config.nvidiaMaxTokens,
      temperature: 0.2,
      stream: false,
      reasoning_effort: "low",
    }),
  });

  const body = (await response.json()) as ChatCompletionResponse;
  if (!response.ok) {
    const detail = body.error?.message ?? response.statusText;
    throw new Error(`NVIDIA chat failed (${response.status}): ${detail}`);
  }

  const choice = body.choices?.[0];
  const text = extractText(choice?.message);
  if (!text) {
    const reasoningTokens =
      body.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    throw new Error(
      `NVIDIA chat returned an empty reply (finish=${choice?.finish_reason ?? "unknown"}, reasoning_tokens=${reasoningTokens}).`,
    );
  }

  return { model, text };
}

function isAbort(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export async function writeDraft(input: {
  customerMessage: string;
  department: Department;
  route: RouteKind;
  frustrationScore: number;
  urgency: number;
}): Promise<{ model: string; text: string }> {
  const timeoutMs = config.nvidiaTimeoutMs;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await chatOnce(input, controller.signal);
    } catch (error) {
      lastError = error;
      if (isAbort(error)) {
        throw new Error(
          `NVIDIA chat timed out after ${timeoutMs}ms. Try again, or set NVIDIA_MODEL to a faster catalog model.`,
        );
      }
      if (attempt === 1 && error instanceof Error) {
        console.warn(`NVIDIA chat attempt 1 failed: ${error.message}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("NVIDIA chat failed.");
}
