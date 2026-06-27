// src/commands/index.mjs — the subcommand registry.
//
// TO ADD A NEW SUBCOMMAND:
//   1. Create src/commands/<name>.mjs exporting { name, summary, usage, run(args) }.
//   2. Import it below and add it to the COMMANDS array.
// That's the only wiring needed — bin/cli.mjs routes by `name` automatically.

import serve from './serve.mjs';
import projectLs from './project-ls.mjs';
import open from './open.mjs';

export const COMMANDS = [serve, projectLs, open];

export function findCommand(name) {
  return COMMANDS.find((c) => c.name === name || (c.aliases || []).includes(name));
}

export function printHelp() {
  console.log(`
  codegraph-viz — local visualizer for codegraph's knowledge graph

  Usage:
    codegraph-viz [options]                 open the current project (default)
    codegraph-viz <command> [args]

  Commands:`);
  for (const c of COMMANDS) console.log(`    ${c.usage.padEnd(34)}${c.summary}`);
  console.log(`
  Common options:
    --db=<path>        use a specific codegraph.db
    --project=<path>   use a specific project directory
    --port=<n>         port (default 7700, auto-bumps if taken)
    --no-open          don't auto-open the browser
    -h, --help         show this help
`);
}
