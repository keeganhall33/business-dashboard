import { execFileSync } from "node:child_process";

const args = ["sessions", "--all-agents", "--json"];
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
  process.exitCode = 1;
}
