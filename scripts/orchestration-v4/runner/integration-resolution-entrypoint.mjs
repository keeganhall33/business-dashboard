import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [taskPrompt, timeoutSeconds = '900', ollama = '/opt/homebrew/bin/ollama', model = 'qwen2.5-coder:14b'] = process.argv.slice(2);
if (!taskPrompt) throw new Error('V4_INTEGRATION_PROPOSAL_PROMPT_REQUIRED');

const workspacePath = process.cwd();
if (!path.isAbsolute(workspacePath)) throw new Error('V4_INTEGRATION_PROPOSAL_CWD_REQUIRED');

function runGit(args) {
  const result = spawnSync('git', ['-C', workspacePath, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || '').trim());
  return String(result.stdout || '').trim();
}

function normalizeJsonWhitespaceOutsideStrings(text) {
  let output = '';
  let inString = false;
  let escaped = false;
  for (const ch of String(text || '')) {
    if (inString) {
      output += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      output += ch;
      continue;
    }
    output += /[\u00a0\u202f\u2007]/u.test(ch) ? ' ' : ch;
  }
  return output;
}

function repairInvalidJsonEscapesInsideStrings(text) {
  const source = String(text || '');
  let output = '';
  let inString = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (!inString) {
      output += ch;
      if (ch === '"') inString = true;
      continue;
    }
    if (ch === '"') {
      output += ch;
      inString = false;
      continue;
    }
    if (ch !== '\\') {
      output += ch;
      continue;
    }
    const next = source[i + 1];
    if (next == null) {
      output += ch;
      continue;
    }
    if (/^["\\/bfnrtu]$/.test(next)) {
      output += ch + next;
      i += 1;
      continue;
    }
    output += `\\\\${next}`;
    i += 1;
  }
  return output;
}

function normalizeProposalJson(text) {
  const trimmed = String(text || '').replace(/\r\n?/g, '\n').trim();
  const lines = trimmed.split('\n');
  const unwrapped = /^```(?:json)?\s*$/i.test(lines[0] || '') && /^```\s*$/.test(lines.at(-1) || '')
    ? lines.slice(1, -1).join('\n').trim()
    : trimmed;
  return repairInvalidJsonEscapesInsideStrings(normalizeJsonWhitespaceOutsideStrings(unwrapped));
}

function parseErrorPosition(message = '') {
  const match = String(message).match(/position\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function codepointWindow(text, position, radius = 12) {
  if (!Number.isInteger(position) || position < 0) return '';
  const start = Math.max(0, position - radius);
  const end = Math.min(text.length, position + radius + 1);
  return Array.from(text.slice(start, end), (ch) => ch.codePointAt(0)?.toString(16)).join(',');
}

const files = runGit(['diff', '--name-only', '--diff-filter=U']).split(/\r?\n/).filter(Boolean);
if (!files.length) {
  process.stdout.write(`V4_RESOLUTION ${JSON.stringify({ files: [] })}\n`);
  process.exit(0);
}

const conflictBundle = files.map((relativePath) => {
  const absolutePath = path.resolve(workspacePath, relativePath);
  if (!absolutePath.startsWith(`${workspacePath}${path.sep}`)) throw new Error('V4_INTEGRATION_PROPOSAL_PATH_ESCAPE');
  return `FILE: ${relativePath}\n--- BEGIN CONFLICTED FILE ---\n${fs.readFileSync(absolutePath, 'utf8')}\n--- END CONFLICTED FILE ---`;
}).join('\n\n');

const prompt = [
  taskPrompt,
  '',
  'You cannot call tools and you must not issue shell commands.',
  'Return only one JSON object with this exact shape:',
  '{"files":[{"path":"relative/path","content":"complete resolved file contents"}]}',
  'Include every currently conflicted file exactly once and no other files.',
  'Each content value must contain the complete final file with all conflict markers removed.',
  'Preserve the PR intent while retaining newer compatible functionality from canonical main.',
  'Do not wrap the JSON in markdown fences and do not add commentary.',
  '',
  conflictBundle,
].join('\n');

const child = spawn(ollama, ['run', model, prompt], {
  cwd: workspacePath,
  env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
const timeoutMs = Math.max(1, Number(timeoutSeconds)) * 1000;
const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
timer.unref?.();
child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
child.on('error', (error) => { throw error; });
child.on('exit', (code, signal) => {
  clearTimeout(timer);
  if (stderr) process.stderr.write(stderr);
  if (signal || code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }
  const text = stdout.trim();
  const normalized = normalizeProposalJson(text);
  try {
    const parsed = JSON.parse(normalized);
    process.stdout.write(`V4_RESOLUTION ${JSON.stringify(parsed)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const position = parseErrorPosition(message);
    const codepoints = Array.from(text.slice(0, 8), (ch) => ch.codePointAt(0)?.toString(16)).join(',');
    const tailCodepoints = Array.from(text.slice(-8), (ch) => ch.codePointAt(0)?.toString(16)).join(',');
    const window = codepointWindow(normalized, position);
    process.stderr.write(`V4_INTEGRATION_PROPOSAL_INVALID_JSON message=${JSON.stringify(message)} position=${position ?? 'unknown'} window=${window || 'unknown'} first=${codepoints} last=${tailCodepoints}\n`);
    process.stdout.write(`${text}\n`);
    process.exitCode = 2;
  }
});
