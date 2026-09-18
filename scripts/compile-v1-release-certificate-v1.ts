import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { compileRuntimeV1ReleaseCertificateV1 } from "@/lib/release/v1-release-certificate-runtime-v1";

function usage(): never {
  console.error("Usage: npm run v1:certify -- <evidence.json> [certificate.json]");
  process.exit(64);
}

async function main(): Promise<void> {
  const inputArg = process.argv[2];
  const outputArg = process.argv[3];
  if (!inputArg || process.argv.length > 4) usage();

  const inputPath = resolve(process.cwd(), inputArg);
  const raw = await readFile(inputPath, "utf8");
  const certificate = compileRuntimeV1ReleaseCertificateV1(JSON.parse(raw) as unknown);
  const rendered = `${JSON.stringify(certificate, null, 2)}\n`;

  if (outputArg) {
    const outputPath = resolve(process.cwd(), outputArg);
    await writeFile(outputPath, rendered, { encoding: "utf8", flag: "w" });
  } else {
    process.stdout.write(rendered);
  }

  if (certificate.releaseState === "RELEASED") {
    process.exitCode = 0;
    return;
  }

  if (certificate.releaseState === "READY_FOR_KEEGAN_ACCEPTANCE") {
    console.error("V1 mechanical gates are ready, but final Keegan acceptance is still required for this exact release SHA.");
    process.exitCode = 2;
    return;
  }

  console.error(`V1 release remains blocked by ${certificate.blockers.length} certificate blocker(s).`);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown release certification error";
  console.error(`V1 release certification failed closed: ${message}`);
  process.exitCode = 1;
});
