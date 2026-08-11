import { execFileSync } from "node:child_process";

const commands = [
  ["agent", "--help"],
  ["acp", "--help"],
  ["sessions", "--help"]
];

for (const args of commands) {
  console.log(`=== openclaw ${args.join(" ")} ===`);
  try {
    const out = execFileSync("openclaw", args, {
      encoding: "utf8",
      timeout: 15000,
      stdio: ["ignore", "pipe", "pipe"]
    });
    process.stdout.write(out);
  } catch (error) {
    const code = error?.code ?? "UNKNOWN";
    const status = error?.status ?? "UNKNOWN";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    console.log(`FAILED code=${code} status=${status}`);
    if (stderr) process.stdout.write(stderr);
  }
}
