import { execFileSync } from "node:child_process";

const repo = "keeganhall33/business-dashboard";
const issue = "442";
const openclaw = "/opt/homebrew/bin/openclaw";

function run(args) {
  return execFileSync(openclaw, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

let version = "UNKNOWN";
let help = "";
try { version = run(["--version"]).trim(); } catch (err) { version = String(err?.stdout ?? err?.stderr ?? err?.message ?? err); }
try { help = run(["agent", "exec", "--help"]); } catch (err) { help = String(err?.stdout ?? "") + String(err?.stderr ?? ""); }

const flags = ["--message", "--message-file", "--cwd", "--state-dir", "--config", "--isolated", "--model", "--code-mode", "--local-model-lean", "--thinking", "--fallback", "--auth-env-only", "--timeout", "--json"];
const support = Object.fromEntries(flags.map((flag) => [flag, help.includes(flag)]));
const body = [
  "## Installed OpenClaw agent exec capability probe",
  "",
  "```json",
  JSON.stringify({ version, support }, null, 2),
  "```",
  "",
  "```text",
  help.slice(0, 12000),
  "```"
].join("\n");

execFileSync("gh", ["issue", "comment", issue, "--repo", repo, "--body", body], { stdio: "inherit", timeout: 30000 });
console.log(JSON.stringify({ status: "PASS", version, support }));
