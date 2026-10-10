import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors.js";
import { MAX_MESSAGE_CHARS, normalizeMessage } from "./validate.js";

describe("normalizeMessage", () => {
  it("trims a usable message", () => {
    assert.equal(normalizeMessage("  hello  "), "hello");
  });

  it("rejects an empty message", () => {
    assert.throws(() => normalizeMessage("   "), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.status, 400);
      return true;
    });
  });

  it("rejects a message past the prompt cap", () => {
    assert.throws(
      () => normalizeMessage("a".repeat(MAX_MESSAGE_CHARS + 1)),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.status, 400);
        assert.match(error.message, /4000/);
        return true;
      },
    );
  });
});
