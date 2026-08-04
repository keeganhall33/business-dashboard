import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("fusion scheduler runner does not import action execution or action store modules", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/scheduler/fusionDailyDecisionV1.ts"), "utf8");
  const forbidden = ["@/lib/actions", "action_actions_v1", "execute", "runExecution", "createAction"];
  for (const f of forbidden) {
    assert.equal(src.includes(f), false);
  }
});

