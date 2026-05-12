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
    assert(toolNames2.includes('prunemem_validate_maintenance'), 'tools/list must include prunemem_validate_maintenance');
    assert(toolNames2.includes('prunemem_repair_source_paths'), 'tools/list must include prunemem_repair_source_paths');
    assert(toolNames2.includes('prunemem_update_working_state'), 'tools/list must include prunemem_update_working_state');
    assert(toolNames2.includes('prunemem_curator_apply'), 'tools/list must include prunemem_curator_apply');
    assert(toolNames2.includes('prunemem_update_registries'), 'tools/list must include prunemem_update_registries');
    assert(toolNames2.length === 9, 'tools/list must return exactly 9 tools (no leakage)');
    console.log('PASS: tools/list returns exactly 9 tools');

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

    // 16. tools/call — validate_maintenance happy path (isolated preset, strict: false)
    const vmId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: vmId,
      method: 'tools/call',
      params: {
        name: 'prunemem_validate_maintenance',
        arguments: {
          workspace: process.cwd(),
          preset: 'isolated',
          strict: false,
        },
      },
    });

    const vmRes = await waitForMessage(messages, (m) => m.id === vmId);
    assert(vmRes.result !== undefined, 'validate_maintenance happy path (strict:false) must return a result');
    const vmContent = vmRes.result.content;
    assert(Array.isArray(vmContent), 'validate_maintenance happy path result must have content array');
    assert(vmContent.length > 0, 'validate_maintenance happy path content must not be empty');
    assert(vmContent[0].type === 'text', 'validate_maintenance happy path content must be text');
    const vmParsed = JSON.parse(vmContent[0].text);
    assert(vmParsed.ok === true, 'validate_maintenance happy path parsed result must have ok: true');
    assert(vmParsed.counts !== undefined, 'validate_maintenance happy path parsed result must have counts');
    console.log('PASS: tools/call validate_maintenance happy path (strict: false)');

    // 17. tools/call — validate_maintenance happy path (strict: true)
    const vmTrueId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: vmTrueId,
      method: 'tools/call',
      params: {
        name: 'prunemem_validate_maintenance',
        arguments: {
          workspace: process.cwd(),
          preset: 'isolated',
          strict: true,
        },
      },
    });

    const vmTrueRes = await waitForMessage(messages, (m) => m.id === vmTrueId);
    assert(vmTrueRes.result !== undefined, 'validate_maintenance happy path (strict:true) must return a result');
    const vmTrueContent = vmTrueRes.result.content;
    assert(Array.isArray(vmTrueContent), 'validate_maintenance happy path (strict:true) result must have content array');
    assert(vmTrueContent.length > 0, 'validate_maintenance happy path (strict:true) content must not be empty');
    assert(vmTrueContent[0].type === 'text', 'validate_maintenance happy path (strict:true) content must be text');
    const vmTrueParsed = JSON.parse(vmTrueContent[0].text);
    assert(vmTrueParsed.ok === true, 'validate_maintenance happy path (strict:true) parsed result must have ok: true');
    console.log('PASS: tools/call validate_maintenance happy path (strict: true)');

    // 18. tools/call — validate_maintenance schema error (strict as string "yes")
    const vmErrId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: vmErrId,
      method: 'tools/call',
      params: {
        name: 'prunemem_validate_maintenance',
        arguments: {
          strict: 'yes',
        },
      },
    });

    const vmErrRes = await waitForMessage(messages, (m) => m.id === vmErrId);
    assert(vmErrRes.error !== undefined, 'validate_maintenance schema validation failure must produce protocol-level error');
    assert(vmErrRes.result === undefined, 'validate_maintenance schema validation failure must not return a tool result');
    assert(
      typeof vmErrRes.error.message === 'string',
      'protocol error must have a message'
    );
    assert(
      /strict|boolean/i.test(vmErrRes.error.message),
      'error message should mention strict and/or boolean'
    );
    console.log('PASS: tools/call validate_maintenance error path (strict string → protocol error)');

    // 19. tools/call — validate_maintenance M2 enforcement: paths argument must be rejected
    const vmPathsId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: vmPathsId,
      method: 'tools/call',
      params: {
        name: 'prunemem_validate_maintenance',
        arguments: {
          paths: { workingMemoryRead: '/tmp/whatever' },
        },
      },
    });

    const vmPathsRes = await waitForMessage(messages, (m) => m.id === vmPathsId);
    assert(vmPathsRes.error !== undefined, 'validate_maintenance paths argument must produce a protocol-level error');
    assert(vmPathsRes.result === undefined, 'validate_maintenance paths rejection must not return a tool result');
    assert(
      typeof vmPathsRes.error.message === 'string' && /paths|additional|unexpected/i.test(vmPathsRes.error.message),
      'error message should mention the offending field'
    );
    console.log('PASS: tools/call validate_maintenance rejects paths argument (M2)');

    // 20. tools/call — repair_source_paths happy path (isolated preset, no write → default dry-run)
    const rspId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: rspId,
      method: 'tools/call',
      params: {
        name: 'prunemem_repair_source_paths',
        arguments: {
          workspace: process.cwd(),
          preset: 'isolated',
        },
      },
    });

    const rspRes = await waitForMessage(messages, (m) => m.id === rspId);
    assert(rspRes.result !== undefined, 'repair_source_paths happy path (default dry-run) must return a result');
    const rspContent = rspRes.result.content;
    assert(Array.isArray(rspContent), 'repair_source_paths happy path result must have content array');
    assert(rspContent.length > 0, 'repair_source_paths happy path content must not be empty');
    assert(rspContent[0].type === 'text', 'repair_source_paths happy path content must be text');
    const rspParsed = JSON.parse(rspContent[0].text);
    assert(rspParsed.ok === true, 'repair_source_paths happy path parsed result must have ok: true');
    assert(rspParsed.write === false, 'repair_source_paths default dry-run must return write: false');
    assert(rspParsed.repaired !== undefined, 'repair_source_paths happy path parsed result must have repaired');
    console.log('PASS: tools/call repair_source_paths happy path (default dry-run)');

    // 21. tools/call — repair_source_paths happy path (explicit write: false)
    const rspFalseId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: rspFalseId,
      method: 'tools/call',
      params: {
        name: 'prunemem_repair_source_paths',
        arguments: {
          workspace: process.cwd(),
          preset: 'isolated',
          write: false,
        },
      },
    });

    const rspFalseRes = await waitForMessage(messages, (m) => m.id === rspFalseId);
    assert(rspFalseRes.result !== undefined, 'repair_source_paths happy path (write:false) must return a result');
    const rspFalseContent = rspFalseRes.result.content;
    assert(Array.isArray(rspFalseContent), 'repair_source_paths happy path (write:false) result must have content array');
    assert(rspFalseContent.length > 0, 'repair_source_paths happy path (write:false) content must not be empty');
    assert(rspFalseContent[0].type === 'text', 'repair_source_paths happy path (write:false) content must be text');
    const rspFalseParsed = JSON.parse(rspFalseContent[0].text);
    assert(rspFalseParsed.ok === true, 'repair_source_paths happy path (write:false) parsed result must have ok: true');
    assert(rspFalseParsed.write === false, 'repair_source_paths write:false must return write: false');
    console.log('PASS: tools/call repair_source_paths happy path (write: false)');

    // 22. tools/call — repair_source_paths happy path (explicit write: true)
    const rspTrueId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: rspTrueId,
      method: 'tools/call',
      params: {
        name: 'prunemem_repair_source_paths',
        arguments: {
          workspace: process.cwd(),
          preset: 'isolated',
          write: true,
        },
      },
    });

    const rspTrueRes = await waitForMessage(messages, (m) => m.id === rspTrueId);
    assert(rspTrueRes.result !== undefined, 'repair_source_paths happy path (write:true) must return a result');
    const rspTrueContent = rspTrueRes.result.content;
    assert(Array.isArray(rspTrueContent), 'repair_source_paths happy path (write:true) result must have content array');
    assert(rspTrueContent.length > 0, 'repair_source_paths happy path (write:true) content must not be empty');
    assert(rspTrueContent[0].type === 'text', 'repair_source_paths happy path (write:true) content must be text');
    const rspTrueParsed = JSON.parse(rspTrueContent[0].text);
    assert(rspTrueParsed.ok === true, 'repair_source_paths happy path (write:true) parsed result must have ok: true');
    assert(rspTrueParsed.write === true, 'repair_source_paths write:true must return write: true');
    console.log('PASS: tools/call repair_source_paths happy path (write: true)');

    // 23. tools/call — repair_source_paths schema error (write as string "yes")
    const rspErrId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: rspErrId,
      method: 'tools/call',
      params: {
        name: 'prunemem_repair_source_paths',
        arguments: {
          write: 'yes',
        },
      },
    });

    const rspErrRes = await waitForMessage(messages, (m) => m.id === rspErrId);
    assert(rspErrRes.error !== undefined, 'repair_source_paths schema validation failure must produce protocol-level error');
    assert(rspErrRes.result === undefined, 'repair_source_paths schema validation failure must not return a tool result');
    assert(
      typeof rspErrRes.error.message === 'string',
      'protocol error must have a message'
    );
    assert(
      /write|boolean/i.test(rspErrRes.error.message),
      'error message should mention write and/or boolean'
    );
    console.log('PASS: tools/call repair_source_paths error path (write string → protocol error)');

    // 24. tools/call — repair_source_paths M2 enforcement: paths argument must be rejected
    const rspPathsId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: rspPathsId,
      method: 'tools/call',
      params: {
        name: 'prunemem_repair_source_paths',
        arguments: {
          paths: { workingMemoryRead: '/tmp/whatever' },
        },
      },
    });

    const rspPathsRes = await waitForMessage(messages, (m) => m.id === rspPathsId);
    assert(rspPathsRes.error !== undefined, 'repair_source_paths paths argument must produce a protocol-level error');
    assert(rspPathsRes.result === undefined, 'repair_source_paths paths rejection must not return a tool result');
    assert(
      typeof rspPathsRes.error.message === 'string' && /paths|additional|unexpected/i.test(rspPathsRes.error.message),
      'error message should mention the offending field'
    );
    console.log('PASS: tools/call repair_source_paths rejects paths argument (M2)');

    // 25. tools/call — update_working_state happy path (isolated preset, write: false)
    const uwsId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: uwsId,
      method: 'tools/call',
      params: {
        name: 'prunemem_update_working_state',
        arguments: {
          workspace: process.cwd(),
          preset: 'isolated',
          write: false,
        },
      },
    });

    const uwsRes = await waitForMessage(messages, (m) => m.id === uwsId);
    assert(uwsRes.result !== undefined, 'update_working_state happy path must return a result');
    const uwsContent = uwsRes.result.content;
    assert(Array.isArray(uwsContent), 'update_working_state happy path result must have content array');
    assert(uwsContent.length > 0, 'update_working_state happy path content must not be empty');
    assert(uwsContent[0].type === 'text', 'update_working_state happy path content must be text');
    const uwsParsed = JSON.parse(uwsContent[0].text);
    assert(uwsParsed.ok === true, 'update_working_state happy path parsed result must have ok: true');
    assert(uwsParsed.state !== undefined, 'update_working_state happy path parsed result must have state');
    console.log('PASS: tools/call update_working_state happy path (write: false)');

    // 26. tools/call — update_working_state schema error (write as string "yes")
    const uwsErrId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: uwsErrId,
      method: 'tools/call',
      params: {
        name: 'prunemem_update_working_state',
        arguments: {
          write: 'yes',
        },
      },
    });

    const uwsErrRes = await waitForMessage(messages, (m) => m.id === uwsErrId);
    assert(uwsErrRes.error !== undefined, 'update_working_state schema validation failure must produce protocol-level error');
    assert(uwsErrRes.result === undefined, 'update_working_state schema validation failure must not return a tool result');
    assert(
      typeof uwsErrRes.error.message === 'string',
      'protocol error must have a message'
    );
    assert(
      /write|boolean/i.test(uwsErrRes.error.message),
      'error message should mention write and/or boolean'
    );
    console.log('PASS: tools/call update_working_state error path (write string → protocol error)');

    // 27. tools/call — update_working_state M2 enforcement: paths argument must be rejected
    const uwsPathsId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: uwsPathsId,
      method: 'tools/call',
      params: {
        name: 'prunemem_update_working_state',
        arguments: {
          paths: { workingMemoryRead: '/tmp/whatever' },
        },
      },
    });

    const uwsPathsRes = await waitForMessage(messages, (m) => m.id === uwsPathsId);
    assert(uwsPathsRes.error !== undefined, 'update_working_state paths argument must produce a protocol-level error');
    assert(uwsPathsRes.result === undefined, 'update_working_state paths rejection must not return a tool result');
    assert(
      typeof uwsPathsRes.error.message === 'string' && /paths|additional|unexpected/i.test(uwsPathsRes.error.message),
      'error message should mention the offending field'
    );
    console.log('PASS: tools/call update_working_state rejects paths argument (M2)');

    // 28. tools/call — curator_apply happy path (isolated preset, write: false)
    const caId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: caId,
      method: 'tools/call',
      params: {
        name: 'prunemem_curator_apply',
        arguments: {
          workspace: process.cwd(),
          preset: 'isolated',
          write: false,
        },
      },
    });

    const caRes = await waitForMessage(messages, (m) => m.id === caId);
    assert(caRes.result !== undefined, 'curator_apply happy path must return a result');
    const caContent = caRes.result.content;
    assert(Array.isArray(caContent), 'curator_apply happy path result must have content array');
    assert(caContent.length > 0, 'curator_apply happy path content must not be empty');
    assert(caContent[0].type === 'text', 'curator_apply happy path content must be text');
    const caParsed = JSON.parse(caContent[0].text);
    assert(caParsed.ok === true, 'curator_apply happy path parsed result must have ok: true');
    assert(caParsed.write === false, 'curator_apply happy path parsed result must have write: false');
    assert(caParsed.summary !== undefined, 'curator_apply happy path parsed result must have summary');
    console.log('PASS: tools/call curator_apply happy path (write: false)');

    // 29. tools/call — curator_apply schema error (write as string "yes")
    const caErrId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: caErrId,
      method: 'tools/call',
      params: {
        name: 'prunemem_curator_apply',
        arguments: {
          write: 'yes',
        },
      },
    });

    const caErrRes = await waitForMessage(messages, (m) => m.id === caErrId);
    assert(caErrRes.error !== undefined, 'curator_apply schema validation failure must produce protocol-level error');
    assert(caErrRes.result === undefined, 'curator_apply schema validation failure must not return a tool result');
    assert(
      typeof caErrRes.error.message === 'string',
      'protocol error must have a message'
    );
    assert(
      /write|boolean/i.test(caErrRes.error.message),
      'error message should mention write and/or boolean'
    );
    console.log('PASS: tools/call curator_apply error path (write string → protocol error)');

    // 30. tools/call — curator_apply M2 enforcement: paths argument must be rejected
    const caPathsId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: caPathsId,
      method: 'tools/call',
      params: {
        name: 'prunemem_curator_apply',
        arguments: {
          paths: { workingMemoryRead: '/tmp/whatever' },
        },
      },
    });

    const caPathsRes = await waitForMessage(messages, (m) => m.id === caPathsId);
    assert(caPathsRes.error !== undefined, 'curator_apply paths argument must produce a protocol-level error');
    assert(caPathsRes.result === undefined, 'curator_apply paths rejection must not return a tool result');
    assert(
      typeof caPathsRes.error.message === 'string' && /paths|additional|unexpected/i.test(caPathsRes.error.message),
      'error message should mention the offending field'
    );
    console.log('PASS: tools/call curator_apply rejects paths argument (M2)');

    // 31. tools/call — update_registries happy path (isolated preset, write: false)
    const urId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: urId,
      method: 'tools/call',
      params: {
        name: 'prunemem_update_registries',
        arguments: {
          workspace: process.cwd(),
          preset: 'isolated',
          write: false,
        },
      },
    });

    const urRes = await waitForMessage(messages, (m) => m.id === urId);
    assert(urRes.result !== undefined, 'update_registries happy path must return a result');
    const urContent = urRes.result.content;
    assert(Array.isArray(urContent), 'update_registries happy path result must have content array');
    assert(urContent.length > 0, 'update_registries happy path content must not be empty');
    assert(urContent[0].type === 'text', 'update_registries happy path content must be text');
    const urParsed = JSON.parse(urContent[0].text);
    assert(urParsed.ok === true, 'update_registries happy path parsed result must have ok: true');
    assert(urParsed.write === false, 'update_registries happy path parsed result must have write: false');
    assert(urParsed.files !== undefined, 'update_registries happy path parsed result must have files');
    console.log('PASS: tools/call update_registries happy path (write: false)');

    // 32. tools/call — update_registries schema error (write as string "yes")
    const urErrId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: urErrId,
      method: 'tools/call',
      params: {
        name: 'prunemem_update_registries',
        arguments: {
          write: 'yes',
        },
      },
    });

    const urErrRes = await waitForMessage(messages, (m) => m.id === urErrId);
    assert(urErrRes.error !== undefined, 'update_registries schema validation failure must produce protocol-level error');
    assert(urErrRes.result === undefined, 'update_registries schema validation failure must not return a tool result');
    assert(
      typeof urErrRes.error.message === 'string',
      'protocol error must have a message'
    );
    assert(
      /write|boolean/i.test(urErrRes.error.message),
      'error message should mention write and/or boolean'
    );
    console.log('PASS: tools/call update_registries error path (write string → protocol error)');

    // 33. tools/call — update_registries M2 enforcement: paths argument must be rejected
    const urPathsId = ++idCounter;
    sendMessage(proc.stdin, {
      jsonrpc: '2.0',
      id: urPathsId,
      method: 'tools/call',
      params: {
        name: 'prunemem_update_registries',
        arguments: {
          paths: { workingMemoryRead: '/tmp/whatever' },
        },
      },
    });

    const urPathsRes = await waitForMessage(messages, (m) => m.id === urPathsId);
    assert(urPathsRes.error !== undefined, 'update_registries paths argument must produce a protocol-level error');
    assert(urPathsRes.result === undefined, 'update_registries paths rejection must not return a tool result');
    assert(
      typeof urPathsRes.error.message === 'string' && /paths|additional|unexpected/i.test(urPathsRes.error.message),
      'error message should mention the offending field'
    );
    console.log('PASS: tools/call update_registries rejects paths argument (M2)');
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
