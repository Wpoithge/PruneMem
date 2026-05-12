#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SERVER_PATH = fileURLToPath(new URL('../../src/mcp/bin.js', import.meta.url));

let idCounter = 0;

function sendMessage(stdin, msg) {
  const json = JSON.stringify(msg);
  stdin.write(json + '\n');
}

function readMessages(stdout) {
  let buffer = '';
  const messages = [];

  stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line in buffer
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        messages.push(JSON.parse(line));
      } catch {
        // ignore parse errors in test harness
      }
    }
  });

  return messages;
}

function waitForMessage(messages, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const idx = messages.findIndex(predicate);
      if (idx !== -1) {
        resolve(messages[idx]);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Timeout waiting for message'));
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });
}

let failed = false;
function assert(condition, message) {
  if (!condition) {
    console.error(`ASSERT FAIL: ${message}`);
    failed = true;
  }
}

async function run() {
  const proc = spawn(process.execPath, [SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  const messages = readMessages(proc.stdout);

  try {
    // 1. Initialize handshake
    const initId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: initId,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'prunemem-test-client', version: '0.0.1' },
      },
    });

    const initRes = await waitForMessage(messages, (m) => m.id === initId);
    assert(initRes.result !== undefined, 'initialize must return a result');
    assert(initRes.result.protocolVersion !== undefined, 'initialize result must contain protocolVersion');
    console.log('PASS: initialize handshake');

    // 2. Initialized notification
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    });

    // 3. tools/list
    const listId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: listId,
      method: 'tools/list',
      params: {},
    });

    const listRes = await waitForMessage(messages, (m) => m.id === listId);
    assert(Array.isArray(listRes.result?.tools), 'tools/list must return tools array');
    const toolNames = listRes.result.tools.map((t) => t.name);
    assert(toolNames.includes('prunemem_archive_session'), 'tools/list must include prunemem_archive_session');
    console.log('PASS: tools/list includes prunemem_archive_session');

    // 4. tools/call — happy path with isolated preset (avoids polluting examples/)
    const happyId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: happyId,
      method: 'tools/call',
      params: {
        name: 'prunemem_archive_session',
        arguments: {
          workspace: process.cwd(),
          preset: 'isolated',
        },
      },
    });

    const happyRes = await waitForMessage(messages, (m) => m.id === happyId);
    assert(happyRes.result !== undefined, 'happy path call must return a result');
    const happyContent = happyRes.result.content;
    assert(Array.isArray(happyContent), 'happy path result must have content array');
    assert(happyContent.length > 0, 'happy path content must not be empty');
    assert(happyContent[0].type === 'text', 'happy path content must be text');
    const happyParsed = JSON.parse(happyContent[0].text);
    assert(happyParsed.ok === true, 'happy path parsed result must have ok: true');
    assert(happyParsed.archive !== undefined, 'happy path parsed result must have archive');
    console.log('PASS: tools/call happy path (isolated preset)');

    // 5. tools/call — error path: schema invalid (workspace as number)
    const errId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: errId,
      method: 'tools/call',
      params: {
        name: 'prunemem_archive_session',
        arguments: {
          workspace: 42,
        },
      },
    });

    const errRes = await waitForMessage(messages, (m) => m.id === errId);
    // Schema validation failure in handler throws TypeError which is caught by wrapThrownError
    // → result should have isError: true
    assert(errRes.result !== undefined, 'error path call must return a result');
    assert(errRes.result.isError === true, 'error path result must have isError: true');
    const errContent = errRes.result.content;
    assert(Array.isArray(errContent), 'error path result must have content array');
    const errParsed = JSON.parse(errContent[0].text);
    assert(errParsed.ok === false, 'error path parsed result must have ok: false');
    console.log('PASS: tools/call error path (invalid schema)');
  } finally {
    proc.stdin.end();
    proc.kill();
  }

  if (failed) {
    console.error('\nSome assertions failed.');
    process.exit(1);
  }
  console.log('\nAll MCP MVP tests passed.');
}

run().catch((err) => {
  console.error('Test harness error:', err);
  process.exit(1);
});
