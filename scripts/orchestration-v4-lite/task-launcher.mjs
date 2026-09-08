#!/usr/bin/env node
/**
 * V4-Lite Task Launcher
 * 
 * Responsible for:
 * - Launching tasks in free compatible slots
 * - Creating disposable workspaces
 * - Executing bounded local execution
 * - Handling task completion/rejection
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  workspaceRoot: path.join(__dirname, '../../db/workspaces'),
  executionTimeoutMs: 30000,
};

/**
 * Create a disposable workspace for the task
 */
function createDisposableWorkspace(task) {
  const workspacePath = path.join(CONFIG.workspaceRoot, `workspace-${task.id}`);
  
  try {
    fs.mkdirSync(workspacePath, { recursive: true });
    console.log(`Created workspace at ${workspacePath}`);
    return workspacePath;
  } catch (err) {
    console.error('Failed to create workspace:', err.message);
    return null;
  }
}

/**
 * Clean up disposable workspace on completion/rejection
 */
function cleanupWorkspace(workspacePath, reason = 'cleanup') {
  try {
    if (workspacePath && fs.existsSync(workspacePath)) {
      fs.rmSync(workspacePath, { recursive: true, force: true });
      console.log(`Cleaned up workspace at ${workspacePath} (${reason})`);
    }
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}

/**
 * Launch task in a free slot with bounded execution
 */
function launchTask(task, slotId, options = {}) {
  if (!task || !task.id) {
    console.error('Invalid task provided to launcher');
    return false;
  }
  
  const workspacePath = createDisposableWorkspace(task);
  if (!workspacePath) {
    return false;
  }
  
  const timeoutMs = options.timeoutMs || CONFIG.executionTimeoutMs;
  
  // Execute bounded local execution
  try {
    let output = '';
    
    const worker = spawn('node', ['-e', `
      const { spawnSync } = require('child_process');
      
      let result;
      ${options.exec ? `result = spawnSync(${JSON.stringify(options.exec)}, ${JSON.stringify(options.args || [])}, { 
        cwd: process.env.DISPOSABLE_WORKSPACE || "${workspacePath}",
        env: { ...process.env, PATH: process.env.PATH },
        timeout: ${timeoutMs}
      });` : `try {
        const toolName = ${JSON.stringify(options.tool || 'read')}?.split('/').pop() || 'read';
        const args = process.argv.slice(2);
        
        // Execute tool with deterministic timeout
        const start = Date.now();
        try {
          let output;
          
          if (toolName === 'read') {
            const file = args[0] || '';
            if (file) {
              try {
                const fs = require('fs');
                output = fs.readFileSync(file, 'utf-8').slice(0, 1000); // Limit output
              } catch (e) {
                console.error('File not found:', file);
              }
            } else {
              output = 'No file argument provided';
            }
          } else if (toolName === 'edit') {
            const filePath = args[0] || '';
            const newText = args.slice(1).join(' ');
            if (filePath && newText) {
              try {
                const fs = require('fs');
                let content = fs.readFileSync(filePath, 'utf-8');
                
                // Simple find and replace for edit tool
                const regex = new RegExp(`\\b${escapeRegExp(newText)}\\b`, 'g');
                content = content.replace(regex, newText);
                fs.writeFileSync(filePath, content);
                console.log('Edit applied to', filePath);
                output = 'Edit successful';
              } catch (e) {
                console.error('Edit error:', e.message);
              }
            } else {
              output = 'No file or edit provided';
            }
          } else if (toolName === 'exec') {
            const command = args[0] || '';
            const timeoutSecs = 30;
            
            let stdout = '';
            let stderr = '';
            
            const p = spawn('sh', ['-c', command], {
              cwd: process.env.DISPOSABLE_WORKSPACE || "${workspacePath}",
              env: { ...process.env, PATH: process.env.PATH },
              timeout: timeoutSecs * 1000
            });
            
            p.stdout.on('data', d => stdout += d);
            p.stderr.on('data', d => stderr += d);
            
            p.on('exit', (code) => {
              output = \`stdout=\${stdout}\nstderr=\${stderr}\ncode=\${code}\`;
            });
            
            // Wait for process or timeout
            if (!timeoutSecs || Date.now() < start + timeoutSecs * 1000) {
              p.kill();
            }
          } else {
            output = 'Unknown tool: ' + toolName;
          }
          
          console.log(output);
        } catch (e) {
          if (Date.now() - start > ${timeoutMs}) {
            console.error('Tool timeout');
          } else {
            console.error('Tool error:', e.message);
          }
        }
      }` };
      
      if (result && result.status === 0) {
        // Success
      } else if (result?.status === 1 || result?.error?.message?.includes('timeout')) {
        console.error('Task failed or timed out');
      } else {
        output = output || 'Unknown execution result';
      }
      
      // Signal workspace cleanup on completion
      try {
        require('fs').rmSync("${workspacePath}", { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    `}], {
      stdio: ['pipe', 'pipe', 'inherit'],
      cwd: workspacePath,
      env: { ...process.env, PATH: process.env.PATH },
      timeout: timeoutMs,
    });
    
    worker.on('error', (err) => {
      console.error('Worker error:', err.message);
    });
    
    worker.on('exit', (code) => {
      cleanupWorkspace(workspacePath, 'completion');
    });
    
    // Return execution result
    return true;
  } catch (err) {
    if (err.code === 'ETIMEDOUT') {
      console.error('Task timeout:', task.id);
    } else {
      console.error('Task error:', err.message);
    }
    
    cleanupWorkspace(workspacePath, 'error');
    return false;
  }
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export { launchTask, createDisposableWorkspace, cleanupWorkspace };
