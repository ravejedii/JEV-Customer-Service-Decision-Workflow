import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import { MAX_MESSAGE_CHARS } from "./workflow/validate.js";
import { createApp } from "./server.js";

async function withServer(
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => {
    server.once("listening", () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe("HTTP boundary", () => {
  it("reports health without calling a model", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/health`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true });
    });
  });

  it("serves the three demo scenarios", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/samples`);
      assert.equal(response.status, 200);
      const body = (await response.json()) as Record<string, string>;
      assert.equal(typeof body.stripe, "string");
      assert.equal(typeof body.billingA, "string");
      assert.equal(typeof body.billingB, "string");
      assert.match(body.stripe, /Stripe/);
    });
  });

  it("rejects an empty ticket before any model call", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/triage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "   " }),
      });
      assert.equal(response.status, 400);
      const body = (await response.json()) as { error: string };
      assert.match(body.error, /required/i);
    });
  });

  it("rejects a ticket over the prompt cap", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/triage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "a".repeat(MAX_MESSAGE_CHARS + 1),
        }),
      });
      assert.equal(response.status, 400);
    });
  });

  it("returns JSON when the body is not JSON", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/triage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      });
      assert.equal(response.status, 400);
      const body = (await response.json()) as { error: string };
      assert.match(body.error, /JSON/);
    });
  });
});
