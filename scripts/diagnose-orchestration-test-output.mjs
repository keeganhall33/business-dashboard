import { execFileSync } from 'node:child_process';

const repo = 'keeganhall33/business-dashboard';
const issue = '370';
let body;
try {
  const out = execFileSync('pnpm', ['exec', 'tsx', '--test', 'test/orchestration-nl-timeout-regression.test.tsx'], {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 2 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  body = `## Focused regression diagnostic\n\nSTATUS=PASS\n\n\`\`\`text\n${String(out).slice(-6000)}\n\`\`\``;
} catch (err) {
  const stdout = typeof err?.stdout === 'string' ? err.stdout : '';
  const stderr = typeof err?.stderr === 'string' ? err.stderr : '';
  const code = err?.status ?? err?.code ?? 'unknown';
  const combined = `${stdout}\n${stderr}`.replace(/gh[pousr]_[A-Za-z0-9_\-]+/g, '[REDACTED_TOKEN]').slice(-10000);
  body = `## Focused regression diagnostic\n\nSTATUS=FAIL\nEXIT=${code}\n\n\`\`\`text\n${combined}\n\`\`\``;
}
execFileSync('gh', ['issue', 'comment', issue, '--repo', repo, '--body', body], { stdio: 'inherit', timeout: 30000 });
