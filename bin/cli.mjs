#!/usr/bin/env node
// bin/cli.mjs — entry point. Routes the first positional arg to a subcommand,
// otherwise runs the default `serve` command.

import { parseArgs } from '../src/util.mjs';
import { findCommand, printHelp } from '../src/commands/index.mjs';
import serve from '../src/commands/serve.mjs';

const args = parseArgs(process.argv.slice(2));

if (args.h || args.help) { printHelp(); process.exit(0); }

const first = args._[0];
const cmd = first ? findCommand(first) : null;

if (cmd) {
  cmd.run(args);
} else if (first && first !== 'serve') {
  // Unknown positional that isn't a command — show help instead of guessing.
  console.error(`  Unknown command: ${first}\n`);
  printHelp();
  process.exit(1);
} else {
  serve.run(args);
}
