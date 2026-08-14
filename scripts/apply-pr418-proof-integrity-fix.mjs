import { execFileSync } from 'node:child_process';

const repo = 'keeganhall33/business-dashboard';
const target = 'fix/pr418-export-scope';
const path = 'scripts/orchestration-run-issue-openclaw.mjs';

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024
  });
}

function getFile() {
  const raw = gh(['api','--method','GET',`repos/${repo}/contents/${path}`,'-f',`ref=${target}`]);
  const obj = JSON.parse(raw);
  return {
    sha: obj.sha,
    text: Buffer.from(String(obj.content || '').replace(/\n/g, ''), 'base64').toString('utf8')
  };
}

function putFile(sha, text) {
  gh([
    'api','--method','PUT',`repos/${repo}/contents/${path}`,
    '-f','message=Fix OpenClaw JSON extractor module scope',
    '-f',`content=${Buffer.from(text, 'utf8').toString('base64')}`,
    '-f',`sha=${sha}`,
    '-f',`branch=${target}`
  ]);
}

try {
  const file = getFile();
  let text = file.text;
  const startMarker = 'function collectTopLevelJsonObjects(raw) {';
  const endMarker = '\nfunction runOpenclawWithPrompt(agentId, message) {';
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('extractor block markers not found');

  let block = text.slice(start, end).trimEnd();
  if (!block.includes('export function extractOpenclawJson')) {
    throw new Error('expected exported extractor not found inside main');
  }

  text = text.slice(0, start) + text.slice(end + 1);
  const mainMarker = 'async function main() {';
  const mainIndex = text.indexOf(mainMarker);
  if (mainIndex < 0) throw new Error('main marker not found');
  text = text.slice(0, mainIndex) + block + '\n\n' + text.slice(mainIndex);

  putFile(file.sha, text);
  console.log('PR418_EXPORT_SCOPE_FIXED=true');
} catch (error) {
  console.error('PR418_EXPORT_SCOPE_FIXED=false');
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
}
