import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function acquire(lockPath: string) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const fd = fs.openSync(lockPath, "wx");
  fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
  fs.closeSync(fd);
}

test("worker lock prevents double-dispatch for same worker identity", () => {
  const lockDir = path.join(os.tmpdir(), "orch-lock-test");
  const lockPath = path.join(lockDir, "local-a.lock");
  fs.rmSync(lockDir, { recursive: true, force: true });

  acquire(lockPath);

  let threw = false;
  try {
    acquire(lockPath);
  } catch {
    threw = true;
  }
  assert.equal(threw, true);
});

export {};
