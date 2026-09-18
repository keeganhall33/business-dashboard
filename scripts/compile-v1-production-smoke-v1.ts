import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { compileRuntimeV1ProductionSmokeV1 } from "@/lib/release/v1-production-smoke-runtime-v1";

function usage(): never {
  console.error("Usage: npm run v1:smoke:certify -- <observations.json> [smoke-evidence.json]");
  process.exit(64);
}

async function main(): Promise<void> {
  const inputArg = process.argv[2];
  const outputArg = process.argv[3];
  if (!inputArg || process.argv.length > 4) usage();

  const inputPath = resolve(process.cwd(), inputArg);
  const raw = await readFile(inputPath, "utf8");
  const result = compileRuntimeV1ProductionSmokeV1(JSON.parse(raw) as unknown);
  const rendered = `${JSON.stringify(result, null, 2)}\n`;

  if (outputArg) {
    const outputPath = resolve(process.cwd(), outputArg);
    await writeFile(outputPath, rendered, { encoding: "utf8", flag: "w" });
  } else {
    process.stdout.write(rendered);
  }

  if (result.status === "PASS") {
    process.exitCode = 0;
    return;
  }

  console.error(`V1 production smoke remains blocked by ${result.blockers.length} blocker(s).`);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown production smoke evidence error";
  console.error(`V1 production smoke evidence compilation failed closed: ${message}`);
  process.exitCode = 1;
});
