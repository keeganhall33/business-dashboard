import { execFileSync } from "node:child_process";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const repo = arg("--repo");
const issue = arg("--issue");
const commands = [
  ["agent", "--help"],
  ["acp", "--help"],
  ["sessions", "--help"]
];

const sections = [];
for (const args of commands) {
  const heading = `=== openclaw ${args.join(" ")} ===`;
  try {
    const out = execFileSync("openclaw", args, {
      encoding: "utf8",
      timeout: 15000,
      stdio: ["ignore", "pipe", "pipe"]
    });
    sections.push(`${heading}\n${out}`);
  } catch (error) {
    const code = error?.code ?? "UNKNOWN";
    const status = error?.status ?? "UNKNOWN";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    sections.push(`${heading}\nFAILED code=${code} status=${status}\n${stderr}`);
  }
}

const report = sections.join("\n\n");
process.stdout.write(`${report}\n`);

if (repo && issue) {
  const body = `## OpenClaw CLI discovery\n\n\`\`\`text\n${report.slice(0, 60000)}\n\`\`\``;
  execFileSync("gh", ["issue", "comment", issue, "--repo", repo, "--body", body], {
    encoding: "utf8",
    timeout: 15000,
    stdio: ["ignore", "pipe", "pipe"]
  });
}
