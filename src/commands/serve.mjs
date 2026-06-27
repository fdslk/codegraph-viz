// src/commands/serve.mjs — default command: open one project in the browser.

import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from '../server.mjs';
import { findDbUpward } from '../locate.mjs';
import { findFreePort } from '../util.mjs';

function resolveDbPath(args) {
  if (args.db) return resolve(args.db);
  if (args.project) {
    const p = join(resolve(args.project), '.codegraph', 'codegraph.db');
    return existsSync(p) ? p : null;
  }
  return findDbUpward();
}

async function run(args) {
  const dbPath = resolveDbPath(args);
  if (!dbPath || !existsSync(dbPath)) {
    console.error(`
  No codegraph index found.
  Run this inside a project where you've done \`codegraph init\`,
  or pass --project=<dir> / --db=<path>.
  See what's indexed:  codegraph-viz project ls
`);
    process.exit(1);
  }

  let started;
  try {
    started = await createServer(dbPath);
  } catch (e) {
    console.error(`\n  ${e.message}\n`);
    process.exit(1);
  }
  const { server, schema, driver } = started;
  const port = await findFreePort(Number(args.port) || 7700);
  const url = `http://localhost:${port}`;

  server.listen(port, () => {
    console.log(`\n  codegraph-viz  ▸  running`);
    console.log(`  db      : ${dbPath}`);
    console.log(`  driver  : ${driver}`);
    console.log(`  tables  : nodes=${schema.nodesTable || '?'}  edges=${schema.edgesTable || '?'}  files=${schema.filesTable || '-'}`);
    if (!schema.nodesTable || !schema.edgesTable) {
      console.log(`  ⚠ schema not fully detected — open ${url}/api/schema and set names in src/db.mjs CONFIG.`);
    }
    console.log(`\n  →  ${url}    (Ctrl+C to stop)\n`);
    if (!args.open && args['no-open'] !== true && args.open !== false) exec(`open ${url}`);
  });

  const shutdown = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 500); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export default {
  name: 'serve',
  aliases: ['open-current'],
  summary: 'open the current project (this is the default)',
  usage: 'serve',
  run,
};
