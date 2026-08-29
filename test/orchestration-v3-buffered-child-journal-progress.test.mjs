import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runBufferedChild } from "../scripts/orchestration-v3/buffered-child-process.mjs";

test("observed execution journal activity refreshes buffered-child progress", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v3-journal-progress-"));
  const journal = path.join(dir, "commands.tsv");
  fs.writeFileSync(journal, "", "utf8");

  const script = [
    "const fs = require('node:fs');",
    "const journal = process.env.ORCH_EXECUTION_JOURNAL;",
    "setTimeout(() => fs.appendFileSync(journal, '1\\tgit\\t0\\tstatus --short --branch\\n'), 80);",
    "setTimeout(() => fs.appendFileSync(journal, '2\\tgit\\t0\\tdiff --check\\n'), 190);",
    "setTimeout(() => process.exit(0), 320);"
  ].join(" ");

  const result = await runBufferedChild(process.execPath, ["-e", script], {
    cwd: dir,
    env: { ...process.env, ORCH_EXECUTION_JOURNAL: journal },
    timeout: 2_000,
    progressTimeout: 150
  });

  assert.equal(result.status, 0);
  assert.equal(result.error, null);
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
