import { TOOLS } from '../mcp/server.js';
import { validateArgs } from '../mcp/shared/validate.js';

const VERSION = '0.4.0';

function printHelp() {
  console.log(`prunemem ${VERSION}

Usage:
  prunemem --version
  prunemem --help
  prunemem list-tools
  prunemem call <tool_name> [--json <json>] [--arg key=value ...]

Options:
  --json <json>   Pass arguments as a JSON string
  --arg key=value Pass a single argument (can be repeated)`);
}

function parseCallArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json' && i + 1 < argv.length) {
      return JSON.parse(argv[i + 1]);
    }
    if (argv[i] === '--arg' && i + 1 < argv.length) {
      const raw = argv[i + 1];
      const idx = raw.indexOf('=');
      if (idx === -1) {
        throw new Error(`--arg value must be key=value, got: ${raw}`);
      }
      const key = raw.slice(0, idx);
      let value = raw.slice(idx + 1);
      try {
        value = JSON.parse(value);
      } catch {
        // keep as string
      }
      args[key] = value;
      i++;
    }
  }
  return args;
}

function resolveTool(name) {
  let tool = TOOLS.find((t) => t.name === name);
  if (!tool && !name.startsWith('prunemem_')) {
    tool = TOOLS.find((t) => t.name === `prunemem_${name}`);
  }
  return tool;
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  if (argv[0] === '--version' || argv[0] === '-v') {
    console.log(VERSION);
    process.exit(0);
  }

  if (argv[0] === 'list-tools') {
    for (const tool of TOOLS) {
      const desc = tool.description.split('\n')[0].trim();
      console.log(`${tool.name}\t${desc}`);
    }
    process.exit(0);
  }

  if (argv[0] === 'call') {
    const toolName = argv[1];
    if (!toolName) {
      console.error('Error: missing tool name');
      process.exit(2);
    }

    let args;
    try {
      args = parseCallArgs(argv.slice(2));
    } catch (err) {
      console.error(`Error parsing arguments: ${err.message}`);
      process.exit(2);
    }

    const tool = resolveTool(toolName);
    if (!tool) {
      console.error(`Error: unknown tool: ${toolName}`);
      process.exit(2);
    }

    try {
      validateArgs(args, tool.inputSchema, tool.name);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(2);
    }

    let mcpResult;
    try {
      mcpResult = await tool.handler(args);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(2);
    }

    const text = mcpResult.content?.[0]?.text;
    let parsed;
    try {
      parsed = text !== undefined ? JSON.parse(text) : text;
    } catch {
      parsed = text;
    }

    const isError = mcpResult.isError === true;
    const ok = !isError && parsed?.ok !== false;

    const output = {
      ok,
      tool: tool.name,
      result: parsed,
    };

    console.log(JSON.stringify(output, null, 2));

    if (!ok) {
      console.error('Error: tool returned ok: false');
      process.exit(1);
    }

    process.exit(0);
  }

  console.error(`Error: unknown command: ${argv[0]}`);
  process.exit(2);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(2);
});
