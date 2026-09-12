import { spawnSync } from 'node:child_process';
import { deliveryMetadata, QUALITY_GATES } from './delivery-policy.mjs';

const COMMANDS = Object.freeze({
  DIFF_CHECK: ['git', ['diff', '--check']],
  TYPECHECK: ['npx', ['tsc', '--noEmit']],
  TEST: ['npm', ['test']],
  LINT: ['npm', ['run', 'lint']],
  BUILD: ['npm', ['run', 'build']],
});

export function runRequiredQualityGates({ workspacePath, contract, run = spawnSync, timeoutMs = 15 * 60_000 }) {
  const metadata = deliveryMetadata(contract);
  if (metadata.mode === 'LEGACY' || metadata.qualityGates.length === 0) return { ok: true, skipped: true, gates: [] };
  const gates = [];
  for (const gate of metadata.qualityGates) {
    if (!QUALITY_GATES.includes(gate)) return { ok: false, reason: `V4_QUALITY_GATE_UNKNOWN:${gate}`, gates };
    const [command, args] = COMMANDS[gate];
    const result = run(command, args, { cwd: workspacePath, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 });
    const evidence = {
      gate,
      status: result.status,
      signal: result.signal || null,
      stdoutTail: String(result.stdout || '').slice(-2000),
      stderrTail: String(result.stderr || '').slice(-2000),
    };
    gates.push(evidence);
    if (result.error || result.status !== 0) return { ok: false, reason: `V4_QUALITY_GATE_FAILED:${gate}`, gates };
  }
  return { ok: true, skipped: false, gates };
}
