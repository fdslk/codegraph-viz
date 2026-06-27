// src/commands/_template.mjs — COPY THIS to add a new subcommand.
//
// Steps:
//   1. cp _template.mjs mycommand.mjs   (rename `name` below)
//   2. implement run(args)
//   3. register it in src/commands/index.mjs (import + add to COMMANDS)
//
// `args` is the parsed argv: { _: [positionals], ...flags }.
// e.g. `codegraph-viz mycommand foo --bar=1` -> args._ = ['mycommand','foo'], args.bar = '1'

async function run(args) {
  // const target = args._[1];
  console.log('mycommand: not implemented yet', args);
}

export default {
  name: 'mycommand',          // the word typed after `codegraph-viz`
  aliases: [],                // optional alternate names
  summary: 'one-line description shown in --help',
  usage: 'mycommand <arg> [--flag]',
  run,
};
