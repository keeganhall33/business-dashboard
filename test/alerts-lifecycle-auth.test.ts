import test from "node:test";
import assert from "node:assert/strict";

async function loadModuleFresh() {
  // Bypass module cache so INTERNAL_API_TOKEN changes are observed.
  return import(`../src/lib/auth/internal.ts?ts=${Date.now()}`);
}

test("alerts lifecycle auth: missing INTERNAL_API_TOKEN fails closed", async () => {
  const prev = process.env.INTERNAL_API_TOKEN;
  delete process.env.INTERNAL_API_TOKEN;
  const mod = await loadModuleFresh();

  const res = mod.authorizeInternalRequest(new Request("http://localhost/api/alerts/lifecycle", { method: "POST" }));
  assert.equal(res.ok, false);
  assert.equal(res.status, 503);
  assert.equal(res.error, "Service misconfigured");

  if (prev != null) process.env.INTERNAL_API_TOKEN = prev;
});

test("alerts lifecycle auth: configured token + correct x-internal-token passes", async () => {
  const prev = process.env.INTERNAL_API_TOKEN;
  process.env.INTERNAL_API_TOKEN = "test-internal-token";
  const mod = await loadModuleFresh();

  const res = mod.authorizeInternalRequest(
    new Request("http://localhost/api/alerts/lifecycle", {
      method: "POST",
      headers: { "x-internal-token": "test-internal-token" }
    })
  );

  assert.deepEqual(res, { ok: true });

  if (prev == null) delete process.env.INTERNAL_API_TOKEN;
  else process.env.INTERNAL_API_TOKEN = prev;
});

test("alerts lifecycle auth: configured token + incorrect token returns 401", async () => {
  const prev = process.env.INTERNAL_API_TOKEN;
  process.env.INTERNAL_API_TOKEN = "test-internal-token";
  const mod = await loadModuleFresh();

  const res = mod.authorizeInternalRequest(
    new Request("http://localhost/api/alerts/lifecycle", {
      method: "POST",
      headers: { "x-internal-token": "wrong-token" }
    })
  );

  assert.equal(res.ok, false);
  assert.equal(res.status, 401);
  assert.equal(res.error, "Unauthorized");

  if (prev == null) delete process.env.INTERNAL_API_TOKEN;
  else process.env.INTERNAL_API_TOKEN = prev;
});

test("alerts lifecycle auth: configured token + missing credentials returns 401", async () => {
  const prev = process.env.INTERNAL_API_TOKEN;
  process.env.INTERNAL_API_TOKEN = "test-internal-token";
  const mod = await loadModuleFresh();

  const res = mod.authorizeInternalRequest(new Request("http://localhost/api/alerts/lifecycle", { method: "POST" }));
  assert.equal(res.ok, false);
  assert.equal(res.status, 401);
  assert.equal(res.error, "Unauthorized");

  if (prev == null) delete process.env.INTERNAL_API_TOKEN;
  else process.env.INTERNAL_API_TOKEN = prev;
});

test("alerts lifecycle auth: configured token + correct Authorization bearer passes", async () => {
  const prev = process.env.INTERNAL_API_TOKEN;
  process.env.INTERNAL_API_TOKEN = "test-internal-token";
  const mod = await loadModuleFresh();

  const res = mod.authorizeInternalRequest(
    new Request("http://localhost/api/alerts/lifecycle", {
      method: "POST",
      headers: { Authorization: "Bearer test-internal-token" }
    })
  );

  assert.deepEqual(res, { ok: true });

  if (prev == null) delete process.env.INTERNAL_API_TOKEN;
  else process.env.INTERNAL_API_TOKEN = prev;
});
