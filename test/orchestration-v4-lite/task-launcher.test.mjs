import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskLauncher } from '../../scripts/orchestration-v4-lite/task-launcher.mjs';

function implementationTask(mode = 'DEFAULT') {
  const modeLine = mode === 'DEFAULT' ? '' : `\n**mutation_mode:** ${mode}`;
  return { task_id:'product-task',issue_number:5001,stream:'CORE_INTELLIGENCE',base_sha:'a'.repeat(40),contract_json:JSON.stringify({ title:'Useful product task',body:`Build useful product behavior.${modeLine}`,fileOwnership:'app/useful.ts',taskMutability:'IMPLEMENTATION_MUTATION_REQUIRED' }) };
}

function options(overrides = {}) {
  return { db:{},repoRoot:'/repo',repoFullName:'owner/repo',workspaceRoot:'/workspaces',timeoutMs:10_000,agentTimeoutMs:8_000,stallMs:1_000,...overrides };
}

test('ordinary task launches once without corrections and cleans state', async () => {
  const created=[]; const cleaned=[]; let invocation;
  const launcher=createTaskLauncher(options({ createState:(config)=>{created.push(config);return{configPath:'/tmp/config',stateDir:'/tmp/state'};},cleanupState:(state)=>cleaned.push(state),runTask:async(value)=>{invocation=value;return{status:'COMPLETE'};} }));
  await launcher({task:implementationTask(),slotId:'local-a',canonicalMainSha:'a'.repeat(40)});
  assert.equal(created[0].applyPatchEnabled,true);
  assert.equal(invocation.buildCorrectionAttempt,null);
  assert.equal(invocation.maxCorrectionAttempts,0);
  assert.equal(cleaned.length,1);
});

test('shell-only task mechanically disables apply_patch', async () => {
  let capability;
  const launcher=createTaskLauncher(options({createState:(config)=>{capability=config.applyPatchEnabled;return{configPath:'/tmp/config',stateDir:'/tmp/state'};},cleanupState:()=>{},runTask:async()=>({status:'COMPLETE'})}));
  await launcher({task:implementationTask('SHELL_ONLY'),slotId:'local-a',canonicalMainSha:'a'.repeat(40)});
  assert.equal(capability,false);
});

test('ephemeral state is cleaned after task failure', async () => {
  let cleaned=0;
  const launcher=createTaskLauncher(options({createState:()=>({configPath:'/tmp/config',stateDir:'/tmp/state'}),cleanupState:()=>{cleaned+=1;},runTask:async()=>{throw new Error('failed');}}));
  await assert.rejects(()=>launcher({task:implementationTask(),slotId:'local-a',canonicalMainSha:'a'.repeat(40)}),/failed/);
  assert.equal(cleaned,1);
});

test('integration work uses its executor without allocating agent state', async () => {
  let integrations=0;
  const candidate=implementationTask(); candidate.stream='INTEGRATION_RELEASE';
  const launcher=createTaskLauncher(options({createState:()=>{throw new Error('must not allocate');},runIntegration:async(value)=>{integrations+=1;assert.equal(value.canonicalMainSha,'b'.repeat(40));return{status:'COMPLETE'};}}));
  await launcher({task:candidate,slotId:'local-e',canonicalMainSha:'b'.repeat(40)});
  assert.equal(integrations,1);
});

test('invalid timeout and launch identities fail closed', () => {
  assert.throws(()=>createTaskLauncher(options({agentTimeoutMs:10_000})),/V4_LITE_AGENT_TIMEOUT_INVALID/);
  const launcher=createTaskLauncher(options({runTask:async()=>({})}));
  assert.throws(()=>launcher({task:{},slotId:'local-a'}),/V4_LITE_LAUNCH_IDENTITY_REQUIRED/);
});
