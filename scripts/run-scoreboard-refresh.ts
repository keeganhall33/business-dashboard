import Module from "module";
import { fileURLToPath } from "url";

const dryRun = process.argv.includes("--write") ? false : true;

async function main() {
  patchServerOnlyResolution();
  const { runScoreboardRefresh } = await import("../src/lib/scheduler/scoreboardRefresh");
  const result = await runScoreboardRefresh({ dryRun });
  console.log(JSON.stringify({ dryRun, result }, null, 2));
}

function patchServerOnlyResolution() {
  const stubPath = fileURLToPath(new URL("./server-only-stub.js", import.meta.url));
  type ResolveSignature = (request: string, parent: unknown, isMain: unknown, options: unknown) => string;
  type ModuleWithResolve = typeof Module & { _resolveFilename?: ResolveSignature };
  const moduleAny = Module as ModuleWithResolve;
  const originalResolveFilename = moduleAny._resolveFilename;
  moduleAny._resolveFilename = function (request: string, parent: unknown, isMain: unknown, options: unknown) {
    if (request === "server-only") {
      return stubPath;
    }
    return (originalResolveFilename?.call(this, request, parent, isMain, options) ?? stubPath);
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
