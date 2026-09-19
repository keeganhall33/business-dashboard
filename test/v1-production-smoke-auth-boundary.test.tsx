import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const smokeScript = path.join(repoRoot, "scripts", "smoke-check.sh");

function withFakeCurl(run: (fakeBin: string) => void) {
  const root = mkdtempSync(path.join(tmpdir(), "dashboard-smoke-auth-"));
  const fakeCurl = path.join(root, "curl");

  writeFileSync(
    fakeCurl,
    `#!/usr/bin/env bash
set -euo pipefail

outfile=""
headers=""
url=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    -o|-D|-w|--retry|--retry-delay|--connect-timeout|--max-time)
      case "$1" in
        -o) outfile="$2" ;;
        -D) headers="$2" ;;
      esac
      shift 2
      ;;
    -sS|--retry-all-errors)
      shift
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done

if [ -n "$headers" ]; then
  : > "$headers"
fi

case "$url" in
  */api/health)
    printf '%s' '{"ok":true,"releaseSha":"test-sha"}' > "$outfile"
    printf '200'
    ;;
  */api/dashboard/overview)
    printf '%s' '{"ok":true,"pipelinePanel":{}}' > "$outfile"
    printf '200'
    ;;
  *)
    printf '200'
    ;;
esac
`,
    "utf8",
  );
  chmodSync(fakeCurl, 0o755);

  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("governed production smoke fails closed when a protected route renders anonymously", () => {
  withFakeCurl((fakeBin) => {
    const result = spawnSync("bash", [smokeScript], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        SMOKE_BASE_URL: "https://dashboard.example.test",
        EXPECTED_RELEASE_SHA: "test-sha",
      },
      encoding: "utf8",
    });

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /governed production smoke requires private sign-in for protected route \/dashboard; received HTTP 200/,
    );
  });
});

test("local or development smoke may still render protected routes directly", () => {
  withFakeCurl((fakeBin) => {
    const result = spawnSync("bash", [smokeScript], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        SMOKE_BASE_URL: "http://localhost:3100",
        EXPECTED_RELEASE_SHA: "",
      },
      encoding: "utf8",
    });

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /GET \/dashboard rendered directly in local\/dev smoke/);
    assert.match(result.stdout, /\[smoke-check\] DONE/);
  });
});
