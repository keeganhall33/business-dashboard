import assert from "node:assert/strict";
import test from "node:test";
import { lstat, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import * as storeModule from "@/lib/email/ionos-file-cursor-store-v1";
import { createIonosFileCursorStoreV1 } from "@/lib/email/ionos-file-cursor-store-v1";
import type { EmailSyncCursorV1 } from "@/lib/email/ionos-incremental-sync-v1";

function statePath(name: string): string {
  return path.join(os.tmpdir(), `ionos-cursor-test-${process.pid}-${Date.now()}-${name}`, "cursors.json");
}

function cursor(mailboxId: string, lastSeenUid: string): EmailSyncCursorV1 {
  return {
    mailboxId,
    uidValidity: "90071992547409931",
    lastSeenUid,
    updatedAt: "2026-09-08T20:00:00.000Z"
  };
}

test("missing state starts empty and committed cursor survives a new store instance", async () => {
  const file = statePath("restart");
  const first = createIonosFileCursorStoreV1(file);
  assert.equal(await first.read("personal"), null);
  const next = cursor("personal", "90071992547409939");
  assert.equal(await first.compareAndSet("personal", null, next), true);
  const second = createIonosFileCursorStoreV1(file);
  assert.deepEqual(await second.read("personal"), next);
  const parsed = JSON.parse(await readFile(file, "utf8"));
  assert.equal(parsed.version, 1);
  assert.deepEqual(parsed.cursors.personal, next);
  assert.equal((await lstat(file)).mode & 0o777, 0o600);
});

test("compare-and-set rejects stale expected state without overwriting current truth", async () => {
  const file = statePath("cas");
  const store = createIonosFileCursorStoreV1(file);
  const first = cursor("assistant", "10");
  const second = cursor("assistant", "11");
  assert.equal(await store.compareAndSet("assistant", null, first), true);
  assert.equal(await store.compareAndSet("assistant", null, second), false);
  assert.deepEqual(await store.read("assistant"), first);
});

test("concurrent compare-and-set operations serialize so exactly one wins", async () => {
  const file = statePath("concurrent");
  const store = createIonosFileCursorStoreV1(file);
  const outcomes = await Promise.all([
    store.compareAndSet("marketing", null, cursor("marketing", "20")),
    store.compareAndSet("marketing", null, cursor("marketing", "21")),
    store.compareAndSet("marketing", null, cursor("marketing", "22"))
  ]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  assert.deepEqual(await store.read("marketing"), cursor("marketing", "20"));
});

test("malformed unsupported or secret-bearing state fails closed without reset", async () => {
  for (const [name, raw, pattern] of [
    ["json", "{", /MALFORMED_JSON/],
    ["version", JSON.stringify({ version: 2, cursors: {} }), /VERSION_UNSUPPORTED/],
    ["secret", JSON.stringify({ version: 1, cursors: {}, password: "secret" }), /UNSUPPORTED_KEYS/],
    ["cursor-secret", JSON.stringify({ version: 1, cursors: { personal: { ...cursor("personal", "2"), pass: "secret" } } }), /unsupported keys/i]
  ] as const) {
    const file = statePath(name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, raw, { mode: 0o600 });
    const store = createIonosFileCursorStoreV1(file);
    await assert.rejects(store.read("personal"), pattern);
    assert.equal(await readFile(file, "utf8"), raw);
  }
});

test("symlink and non-regular state paths are rejected", async () => {
  const target = statePath("target");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify({ version: 1, cursors: {} }), { mode: 0o600 });
  const link = statePath("link");
  await mkdir(path.dirname(link), { recursive: true });
  await symlink(target, link);
  await assert.rejects(createIonosFileCursorStoreV1(link).read("personal"), /SYMLINK_REJECTED/);

  const directory = statePath("directory");
  await mkdir(directory, { recursive: true });
  await assert.rejects(createIonosFileCursorStoreV1(directory).read("personal"), /NOT_REGULAR_FILE/);
});

test("invalid paths mailboxes UIDs and timestamps fail closed", async () => {
  assert.throws(() => createIonosFileCursorStoreV1("relative.json"), /PATH_MUST_BE_ABSOLUTE/);
  const store = createIonosFileCursorStoreV1(statePath("invalid"));
  await assert.rejects(store.read("bad/mailbox"), /safe mailbox id/);
  await assert.rejects(
    store.compareAndSet("personal", null, { ...cursor("personal", "2"), lastSeenUid: "02" }),
    /canonical decimal UID/
  );
  await assert.rejects(
    store.compareAndSet("personal", null, { ...cursor("personal", "2"), updatedAt: "yesterday" }),
    /canonical ISO timestamp/
  );
});

test("runtime module exports only the cursor store factory", () => {
  assert.deepEqual(Object.keys(storeModule), ["createIonosFileCursorStoreV1"]);
  assert.doesNotMatch(JSON.stringify(Object.keys(storeModule)), /password|credential|message|subject|body|send|smtp/i);
});
