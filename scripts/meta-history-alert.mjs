#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';

const payloadArg = process.argv.find((arg) => arg.startsWith('--payload='));
if (!payloadArg) {
  console.error('[meta-history-alert] Missing --payload=<path>');
  process.exit(1);
}

const payloadPath = payloadArg.slice('--payload='.length);
let payload;
try {
  payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
} catch (err) {
  console.error('[meta-history-alert] Failed to parse payload JSON:', err.message);
  process.exit(2);
}

if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
  console.error('[meta-history-alert] Payload must be a JSON object');
  process.exit(2);
}

const webhook = process.env.SCHEDULER_ALERT_URL;
if (!webhook) {
  console.error('[meta-history-alert] SCHEDULER_ALERT_URL not set');
  process.exit(3);
}

try {
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = (await response.text()).slice(0, 500);
    console.error('[meta-history-alert] Delivery failed:', response.status, text);
    process.exit(4);
  }
  console.log('[meta-history-alert] Alert sent');
  process.exit(0);
} catch (err) {
  console.error('[meta-history-alert] Delivery error:', err.message);
  process.exit(5);
}
