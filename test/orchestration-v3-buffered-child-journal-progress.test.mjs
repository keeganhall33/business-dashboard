import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runBufferedChild } from "../scripts/orchestration-v3/buffered-child-process.mjs";

test("read-only execution journal churn does not refresh semantic progress", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v3-journal-readonly-"));
  const journal = path.join(dir, "commands.tsv");
  fs.writeFileSync(journal, "", "utf8");

  const script = [
    "const fs = require('node:fs');",
    "const journal = process.env.ORCH_EXECUTION_JOURNAL;",
    "let n = 0;",
    "const timer = setInterval(() => {",
    "  n += 1;",
    "  fs.appendFileSync(journal, `${n}\\tgit\\t0\\tstatus --short --branch\\n`);",
    "}, 40);",
    "setTimeout(() => { clearInterval(timer); process.exit(0); }, 1000);"
  ].join(" ");

  const result = await runBufferedChild(process.execPath, ["-e", script], {
    cwd: dir,
    env: { ...process.env, ORCH_EXECUTION_JOURNAL: journal },
    timeout: 2_000,
    progressTimeout: 150
  });

  assert.equal(result.error?.code, "EPROGRESSSTALL");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("meaningful execution journal activity refreshes semantic progress", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v3-journal-meaningful-"));
  const journal = path.join(dir, "commands.tsv");
  fs.writeFileSync(journal, "", "utf8");

  const script = [
    "const fs = require('node:fs');",
    "const journal = process.env.ORCH_EXECUTION_JOURNAL;",
    "setTimeout(() => fs.appendFileSync(journal, '1\\tpnpm\\t0\\ttest --filter orchestration\\n'), 80);",
    "setTimeout(() => process.exit(0), 170);"
  ].join(" ");

  const result = await runBufferedChild(process.execPath, ["-e", script], {
    cwd: dir,
    env: { ...process.env, ORCH_EXECUTION_JOURNAL: journal },
    timeout: 2_000,
    progressTimeout: 120
  });

  assert.equal(result.status, 0);
  assert.equal(result.error, null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("continuous journal churn cannot defeat absolute timeout", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v3-journal-hard-timeout-"));
  const journal = path.join(dir, "commands.tsv");
  fs.writeFileSync(journal, "", "utf8");

  const script = [
    "const fs = require('node:fs');",
    "const journal = process.env.ORCH_EXECUTION_JOURNAL;",
    "let n = 0;",
    "setInterval(() => {",
    "  n += 1;",
    "  fs.appendFileSync(journal, `${n}\\tpnpm\\t0\\ttest --filter ${n}\\n`);",
    "}, 30);"
  ].join(" ");

  const started = Date.now();
  const result = await runBufferedChild(process.execPath, ["-e", script], {
    cwd: dir,
    env: { ...process.env, ORCH_EXECUTION_JOURNAL: journal },
    timeout: 220,
    progressTimeout: 2_000
  });
  const elapsed = Date.now() - started;

  assert.equal(result.error?.code, "ETIMEDOUT");
  assert.ok(elapsed < 1_500, `absolute timeout should remain bounded, elapsed=${elapsed}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("true no-progress child is still bounded", async () => {
  const result = await runBufferedChild(process.execPath, ["-e", "setTimeout(() => {}, 5000)"], {
    env: { ...process.env, ORCH_EXECUTION_JOURNAL: "" },
    timeout: 2_000,
    progressTimeout: 120
  });

  assert.equal(result.error?.code, "EPROGRESSSTALL");
});
