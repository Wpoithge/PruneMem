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
        console.warn(`[test-harness] skipped non-JSON line: ${line.slice(0, 200)}`);
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

async function gracefulExit(proc) {
  proc.stdin.end();
  const EXIT_TIMEOUT_MS = 2000;
  await new Promise((resolve) => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };
    proc.once('exit', done);
    setTimeout(() => {
      if (!resolved) {
        proc.kill();
        done();
      }
    }, EXIT_TIMEOUT_MS);
  });
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
    // P2: schema validation failure → JSON-RPC error response, NOT isError tool result
    assert(errRes.error !== undefined, 'schema validation failure must produce protocol-level error');
    assert(errRes.result === undefined, 'schema validation failure must not return a tool result');
    assert(
      typeof errRes.error.message === 'string',
      'protocol error must have a message'
    );
    console.log('PASS: tools/call error path (schema validation → protocol error)');

    // 6. tools/call — M2 enforcement: paths argument must be rejected
    const pathsId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: pathsId,
      method: 'tools/call',
      params: {
        name: 'prunemem_archive_session',
        arguments: {
          paths: { workingMemoryRead: '/tmp/whatever' },
        },
      },
    });

    const pathsRes = await waitForMessage(messages, (m) => m.id === pathsId);
    // paths is rejected by validateArgs (additionalProperties: false) → protocol-level error
    assert(pathsRes.error !== undefined, 'paths argument must produce a protocol-level error');
    assert(pathsRes.result === undefined, 'paths rejection must not return a tool result');
    assert(
      typeof pathsRes.error.message === 'string' && /paths|additional|unexpected/i.test(pathsRes.error.message),
      'error message should mention the offending field'
    );
    console.log('PASS: tools/call rejects paths argument (M2)');

    // 6. tools/list — must return exactly 2 tools (no leakage)
    const list2Id = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: list2Id,
      method: 'tools/list',
      params: {},
    });

    const list2Res = await waitForMessage(messages, (m) => m.id === list2Id);
    assert(Array.isArray(list2Res.result?.tools), 'tools/list must return tools array');
    const toolNames2 = list2Res.result.tools.map((t) => t.name);
    assert(toolNames2.includes('prunemem_archive_session'), 'tools/list must include prunemem_archive_session');
    assert(toolNames2.includes('prunemem_runtime_context'), 'tools/list must include prunemem_runtime_context');
    assert(toolNames2.includes('prunemem_execution_plan'), 'tools/list must include prunemem_execution_plan');
    assert(toolNames2.includes('prunemem_get_working_state'), 'tools/list must include prunemem_get_working_state');
    assert(toolNames2.length === 4, 'tools/list must return exactly 4 tools (no leakage)');
    console.log('PASS: tools/list returns exactly 4 tools');

    // 7. tools/call — runtime_context happy path (isolated preset)
    const rtId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: rtId,
      method: 'tools/call',
      params: {
        name: 'prunemem_runtime_context',
        arguments: {
          workspace: process.cwd(),
          preset: 'isolated',
        },
      },
    });

    const rtRes = await waitForMessage(messages, (m) => m.id === rtId);
    assert(rtRes.result !== undefined, 'runtime_context happy path must return a result');
    const rtContent = rtRes.result.content;
    assert(Array.isArray(rtContent), 'runtime_context happy path result must have content array');
    assert(rtContent.length > 0, 'runtime_context happy path content must not be empty');
    assert(rtContent[0].type === 'text', 'runtime_context happy path content must be text');
    const rtParsed = JSON.parse(rtContent[0].text);
    assert(rtParsed.ok === true, 'runtime_context happy path parsed result must have ok: true');
    assert(rtParsed.runtimeContext !== undefined, 'runtime_context happy path parsed result must have runtimeContext');
    console.log('PASS: tools/call runtime_context happy path (isolated preset)');

    // 8. tools/call — runtime_context schema error (state as number)
    const rtErrId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: rtErrId,
      method: 'tools/call',
      params: {
        name: 'prunemem_runtime_context',
        arguments: {
          state: 42,
        },
      },
    });

    const rtErrRes = await waitForMessage(messages, (m) => m.id === rtErrId);
    assert(rtErrRes.error !== undefined, 'runtime_context schema validation failure must produce protocol-level error');
    assert(rtErrRes.result === undefined, 'runtime_context schema validation failure must not return a tool result');
    assert(
      typeof rtErrRes.error.message === 'string',
      'protocol error must have a message'
    );
    console.log('PASS: tools/call runtime_context error path (schema validation → protocol error)');

    // 9. tools/call — runtime_context M2 enforcement: paths argument must be rejected
    const rtPathsId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: rtPathsId,
      method: 'tools/call',
      params: {
        name: 'prunemem_runtime_context',
        arguments: {
          paths: { workingMemoryRead: '/tmp/whatever' },
        },
      },
    });

    const rtPathsRes = await waitForMessage(messages, (m) => m.id === rtPathsId);
    assert(rtPathsRes.error !== undefined, 'runtime_context paths argument must produce a protocol-level error');
    assert(rtPathsRes.result === undefined, 'runtime_context paths rejection must not return a tool result');
    assert(
      typeof rtPathsRes.error.message === 'string' && /paths|additional|unexpected/i.test(rtPathsRes.error.message),
      'error message should mention the offending field'
    );
    console.log('PASS: tools/call runtime_context rejects paths argument (M2)');

    // 10. tools/call — execution_plan happy path
    const epId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: epId,
      method: 'tools/call',
      params: {
        name: 'prunemem_execution_plan',
        arguments: {
          workspace: process.cwd(),
        },
      },
    });

    const epRes = await waitForMessage(messages, (m) => m.id === epId);
    assert(epRes.result !== undefined, 'execution_plan happy path must return a result');
    const epContent = epRes.result.content;
    assert(Array.isArray(epContent), 'execution_plan happy path result must have content array');
    assert(epContent.length > 0, 'execution_plan happy path content must not be empty');
    assert(epContent[0].type === 'text', 'execution_plan happy path content must be text');
    const epParsed = JSON.parse(epContent[0].text);
    assert(epParsed.ok === true, 'execution_plan happy path parsed result must have ok: true');
    assert(epParsed.plan !== undefined, 'execution_plan happy path parsed result must have plan');
    console.log('PASS: tools/call execution_plan happy path');

    // 11. tools/call — execution_plan schema error (input as number)
    const epErrId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: epErrId,
      method: 'tools/call',
      params: {
        name: 'prunemem_execution_plan',
        arguments: {
          input: 42,
        },
      },
    });

    const epErrRes = await waitForMessage(messages, (m) => m.id === epErrId);
    assert(epErrRes.error !== undefined, 'execution_plan schema validation failure must produce protocol-level error');
    assert(epErrRes.result === undefined, 'execution_plan schema validation failure must not return a tool result');
    assert(
      typeof epErrRes.error.message === 'string',
      'protocol error must have a message'
    );
    console.log('PASS: tools/call execution_plan error path (schema validation → protocol error)');

    // 12. tools/call — execution_plan M2 enforcement: paths argument must be rejected
    const epPathsId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: epPathsId,
      method: 'tools/call',
      params: {
        name: 'prunemem_execution_plan',
        arguments: {
          paths: { workingMemoryRead: '/tmp/whatever' },
        },
      },
    });

    const epPathsRes = await waitForMessage(messages, (m) => m.id === epPathsId);
    assert(epPathsRes.error !== undefined, 'execution_plan paths argument must produce a protocol-level error');
    assert(epPathsRes.result === undefined, 'execution_plan paths rejection must not return a tool result');
    assert(
      typeof epPathsRes.error.message === 'string' && /paths|additional|unexpected/i.test(epPathsRes.error.message),
      'error message should mention the offending field'
    );
    console.log('PASS: tools/call execution_plan rejects paths argument (M2)');

    // 13. tools/call — get_working_state happy path (isolated preset)
    const wsId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: wsId,
      method: 'tools/call',
      params: {
        name: 'prunemem_get_working_state',
        arguments: {
          workspace: process.cwd(),
          preset: 'isolated',
        },
      },
    });

    const wsRes = await waitForMessage(messages, (m) => m.id === wsId);
    assert(wsRes.result !== undefined, 'get_working_state happy path must return a result');
    const wsContent = wsRes.result.content;
    assert(Array.isArray(wsContent), 'get_working_state happy path result must have content array');
    assert(wsContent.length > 0, 'get_working_state happy path content must not be empty');
    assert(wsContent[0].type === 'text', 'get_working_state happy path content must be text');
    const wsParsed = JSON.parse(wsContent[0].text);
    assert(wsParsed.schema_version !== undefined, 'get_working_state happy path parsed result must have schema_version');
    console.log('PASS: tools/call get_working_state happy path (isolated preset)');

    // 14. tools/call — get_working_state schema error (input as number)
    const wsErrId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: wsErrId,
      method: 'tools/call',
      params: {
        name: 'prunemem_get_working_state',
        arguments: {
          input: 42,
        },
      },
    });

    const wsErrRes = await waitForMessage(messages, (m) => m.id === wsErrId);
    assert(wsErrRes.error !== undefined, 'get_working_state schema validation failure must produce protocol-level error');
    assert(wsErrRes.result === undefined, 'get_working_state schema validation failure must not return a tool result');
    assert(
      typeof wsErrRes.error.message === 'string',
      'protocol error must have a message'
    );
    console.log('PASS: tools/call get_working_state error path (schema validation → protocol error)');

    // 15. tools/call — get_working_state M2 enforcement: paths argument must be rejected
    const wsPathsId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: wsPathsId,
      method: 'tools/call',
      params: {
        name: 'prunemem_get_working_state',
        arguments: {
          paths: { workingMemoryRead: '/tmp/whatever' },
        },
      },
    });

    const wsPathsRes = await waitForMessage(messages, (m) => m.id === wsPathsId);
    assert(wsPathsRes.error !== undefined, 'get_working_state paths argument must produce a protocol-level error');
    assert(wsPathsRes.result === undefined, 'get_working_state paths rejection must not return a tool result');
    assert(
      typeof wsPathsRes.error.message === 'string' && /paths|additional|unexpected/i.test(wsPathsRes.error.message),
      'error message should mention the offending field'
    );
    console.log('PASS: tools/call get_working_state rejects paths argument (M2)');
  } finally {
    await gracefulExit(proc);
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
