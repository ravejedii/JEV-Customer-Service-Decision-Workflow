import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors.js";
import { readDepartment } from "./questions.js";

describe("readDepartment", () => {
  it("accepts the three routed departments", () => {
    assert.equal(readDepartment("billing"), "billing");
    assert.equal(readDepartment("technical"), "technical");
    assert.equal(readDepartment("sales"), "sales");
  });

  it("fails closed on a department the router does not know", () => {
    assert.throws(() => readDepartment("legal"), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.status, 502);
      assert.match(error.message, /legal/);
      return true;
    });
  });
});
