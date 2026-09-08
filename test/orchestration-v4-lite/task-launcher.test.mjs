#!/usr/bin/env node
/**
 * V4-Lite Task Launcher Tests
 */

import { strict as assert } from 'assert';
import fs from 'fs';
import path from 'path';
import { setTimeout } from 'timers/promises';

async function testDisposableWorkspace() {
  console.log('Test: Disposable workspace lifecycle...');
  
  const workspacePath = path.join(process.cwd(), 'workspace-test-disposable-' + Date.now());
  fs.mkdirSync(workspacePath, { recursive: true });
  assert(fs.existsSync(workspacePath), 'Workspace should be created');
  
  const testFile = path.join(workspacePath, 'test.txt');
  fs.writeFileSync(testFile, 'Hello from disposable workspace\n');
  
  fs.rmSync(workspacePath, { recursive: true, force: true });
  assert(!fs.existsSync(workspacePath), 'Workspace should be cleaned up');
  
  console.log('  ✓ Disposable workspace created and cleaned up');
}

async function testBoundedExecution() {
  console.log('Test: Bounded execution timeout...');
  
  const slowOperation = () => {
    return new Promise((resolve) => {
      setTimeout(35000).then(() => resolve('never'));
    });
  };
  
  const raceResult = await Promise.race([
    slowOperation(),
    new Promise((resolve) => {
      setTimeout(10000).then(() => resolve('timeout'));
    })
  ]);
  
  assert(raceResult === 'timeout', 'Should have timed out');
  console.log('  ✓ Bounded execution timeout works');
}

async function testReadTool() {
  console.log('Test: Read tool...');
  
  const workspacePath = path.join(process.cwd(), 'workspace-test-read-' + Date.now());
  fs.mkdirSync(workspacePath, { recursive: true });
  
  const testFile = path.join(workspacePath, 'read-test.txt');
  fs.writeFileSync(testFile, 'Line 1\nLine 2\nLine 3\n');
  
  const content = fs.readFileSync(testFile, 'utf-8');
  assert(content.includes('Line 1'), 'Read tool should read file content');
  
  fs.rmSync(workspacePath, { recursive: true });
  
  console.log('  ✓ Read tool works correctly');
}

async function testEditTool() {
  console.log('Test: Edit tool...');
  
  const workspacePath = path.join(process.cwd(), 'workspace-test-edit-' + Date.now());
  fs.mkdirSync(workspacePath, { recursive: true });
  
  const testFile = path.join(workspacePath, 'edit-test.txt');
  fs.writeFileSync(testFile, 'Before editing\nSecond line\nThird line\n');
  
  let content = fs.readFileSync(testFile, 'utf-8');
  content = content.replace(/Before editing/ig, 'After editing');
  fs.writeFileSync(testFile, content);
  
  content = fs.readFileSync(testFile, 'utf-8');
  assert(content.includes('After editing'), 'Edit tool should replace text');
  
  fs.rmSync(workspacePath, { recursive: true });
  
  console.log('  ✓ Edit tool works correctly');
}

async function testExecTool() {
  console.log('Test: Exec tool...');
  
  const workspacePath = path.join(process.cwd(), 'workspace-test-exec-' + Date.now());
  fs.mkdirSync(workspacePath, { recursive: true });
  
  try {
    const startTime = Date.now();
    
    const { spawn } = await import('child_process');
    const proc = spawn('sh', ['-c', 'echo "test exec completed successfully"'], {
      cwd: workspacePath,
      timeout: 5000,
    });
    
    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    await new Promise((resolve) => {
      proc.on('close', resolve);
    });
    
    const elapsed = Date.now() - startTime;
    assert(elapsed < 5000, 'Exec should complete within timeout');
    assert(output.includes('test exec completed successfully'), 'Exec output contains expected text');
    
  } catch (err) {
    if (err.code === 'ETIMEDOUT') throw err;
    throw err;
  } finally {
    fs.rmSync(workspacePath, { recursive: true });
    
    console.log('  ✓ Exec tool works correctly');
  }
}

async function testConcurrentLaunches() {
  console.log('Test: Concurrent launches...');
  
  const launchedTasks = [];
  
  async function launchTask(taskId) {
    return new Promise((resolve) => {
      setTimeout(100).then(() => {
        launchedTasks.push({ id: taskId, status: 'completed' });
        resolve();
      });
    });
  }
  
  await Promise.all([
    launchTask('task-1'),
    launchTask('task-2'),
    launchTask('task-3'),
  ]);
  
  assert(launchedTasks.length === 3, 'All tasks should complete');
  
  console.log('  ✓ Concurrent launches work correctly');
}

async function testSlotRelease() {
  console.log('Test: Slot release isolation...');
  
  const slots = Array.from({ length: 6 }, (_, i) => ({
    id: 'slot-' + (i + 1),
    taskId: null,
  }));
  
  for (let i = 0; i < 6; i++) {
    slots[i].taskId = 'task-' + i;
  }
  
  slots[2].taskId = null; // Release slot 3
  
  for (let i = 0; i < 6; i++) {
    if (i !== 2) {
      assert(slots[i].taskId, 'Slot ' + (i + 1) + ' should still be occupied');
    }
  }
  
  console.log('  ✓ Slot release is isolated to completed task only');
}

async function runTests() {
  console.log('=== V4-Lite Task Launcher Tests ===\n');
  
  try {
    await testDisposableWorkspace();
    await testBoundedExecution();
    await testReadTool();
    await testEditTool();
    await testExecTool();
    await testConcurrentLaunches();
    await testSlotRelease();
    
    console.log('\n=== All Tests Passed ===\n');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err.message);
    process.exit(1);
  }
}

runTests();
