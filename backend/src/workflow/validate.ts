import { AppError } from "../errors.js";

/** Caps prompt size. The JSON body limit is a separate, larger backstop. */
export const MAX_MESSAGE_CHARS = 4_000;

export function normalizeMessage(message: string): string {
  const customerMessage = message.trim();
  if (!customerMessage) {
    throw new AppError("Message is required.", 400);
  }
  if (customerMessage.length > MAX_MESSAGE_CHARS) {
    throw new AppError(
      `Message must be ${MAX_MESSAGE_CHARS} characters or fewer.`,
      400,
    );
  }
  return customerMessage;
}
