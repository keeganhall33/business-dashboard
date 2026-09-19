import assert from "node:assert/strict";
import test from "node:test";

import { evaluateVercelDeploymentGateV1 } from "../../scripts/check-vercel-deployment-gate-v1.mjs";

const SHA = "abc123";

test("waits while the canonical Vercel status has not been reported", () => {
  const gate = evaluateVercelDeploymentGateV1(
    {
      sha: SHA,
      statuses: [
        {
          context: "some-other-check",
          state: "failure",
          description: "unrelated status",
        },
      ],
    },
    SHA,
  );

  assert.deepEqual(gate, {
    state: "WAIT",
    reason: "VERCEL_STATUS_NOT_YET_REPORTED",
    description: null,
    updatedAt: null,
  });
});

test("waits on an exact-SHA pending Vercel deployment", () => {
  const gate = evaluateVercelDeploymentGateV1(
    {
      sha: SHA,
      statuses: [
        {
          context: "Vercel",
          state: "pending",
          description: "Deployment in progress",
          updated_at: "2026-09-19T04:50:00Z",
        },
      ],
    },
    SHA,
  );

  assert.equal(gate.state, "WAIT");
  assert.equal(gate.reason, "VERCEL_STATUS_PENDING");
});

test("allows smoke to continue after exact-SHA Vercel success", () => {
  const gate = evaluateVercelDeploymentGateV1(
    {
      sha: SHA,
      statuses: [
        {
          context: "Vercel",
          state: "success",
          description: "Deployment complete",
          updated_at: "2026-09-19T04:51:00Z",
        },
      ],
    },
    SHA,
  );

  assert.equal(gate.state, "READY");
  assert.equal(gate.reason, "VERCEL_STATUS_SUCCESS");
});

test("blocks immediately on an explicit Vercel deployment failure", () => {
  const gate = evaluateVercelDeploymentGateV1(
    {
      sha: SHA,
      statuses: [
        {
          context: "Vercel",
          state: "failure",
          description: "Deployment rate limited — retry in 24 hours.",
          updated_at: "2026-09-19T04:46:37Z",
        },
      ],
    },
    SHA,
  );

  assert.equal(gate.state, "BLOCKED");
  assert.equal(gate.reason, "VERCEL_STATUS_FAILURE");
  assert.equal(gate.description, "Deployment rate limited — retry in 24 hours.");
});

test("uses the newest canonical Vercel status when more than one is present", () => {
  const gate = evaluateVercelDeploymentGateV1(
    {
      sha: SHA,
      statuses: [
        {
          context: "Vercel",
          state: "failure",
          updated_at: "2026-09-19T04:45:00Z",
        },
        {
          context: "Vercel",
          state: "success",
          updated_at: "2026-09-19T04:55:00Z",
        },
      ],
    },
    SHA,
  );

  assert.equal(gate.state, "READY");
});

test("fails closed if the status response is for a different release SHA", () => {
  const gate = evaluateVercelDeploymentGateV1(
    {
      sha: "different-sha",
      statuses: [{ context: "Vercel", state: "success" }],
    },
    SHA,
  );

  assert.equal(gate.state, "BLOCKED");
  assert.equal(gate.reason, "STATUS_RESPONSE_SHA_MISMATCH");
});

test("fails closed on malformed status payloads", () => {
  const gate = evaluateVercelDeploymentGateV1({ sha: SHA, statuses: null }, SHA);

  assert.equal(gate.state, "BLOCKED");
  assert.equal(gate.reason, "STATUS_RESPONSE_MALFORMED");
});
