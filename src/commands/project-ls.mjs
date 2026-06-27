// src/commands/project-ls.mjs — `codegraph-viz project ls`

import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { scanProjects, defaultRoots } from '../locate.mjs';
import { quickStats } from '../db.mjs';
import { dbMtime, fmtNum, fmtRelTime, printTable } from '../util.mjs';

const short = (p) => p.replace(homedir(), '~');

async function run(args) {
  // `project ls` -> args._ === ['project', 'ls']; allow `project` alone too.
  const sub = args._[1];
  if (args._[0] === 'project' && sub && sub !== 'ls') {
    console.error(`  Unknown: project ${sub}. Try: codegraph-viz project ls`);
    process.exit(1);
  }

  const roots = args.scan ? [resolve(args.scan)] : defaultRoots();
  const depth = Number(args.depth) || 4;
  const projects = await scanProjects(roots, depth);

  const rows = [];
  for (const { project, db } of projects) {
    const [stats, mtime] = await Promise.all([quickStats(db), dbMtime(db)]);
    rows.push({ project, db, mtime, ...stats });
  }
  rows.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));

  if (args.json) { console.log(JSON.stringify(rows, null, 2)); return; }

  if (!rows.length) {
    console.log(`\n  No indexed projects found under: ${roots.map(short).join(', ')}`);
    console.log(`  Tip: --scan=<dir> to look elsewhere, --depth=<n> to go deeper.\n`);
    return;
  }

  console.log(`\n  INDEXED PROJECTS (${rows.length} found)\n`);
  printTable(
    ['#', 'PROJECT', 'SYMBOLS', 'EDGES', 'UPDATED', 'PATH'],
    rows.map((r, i) => [
      String(i + 1),
      r.project.split('/').pop(),
      r.ok ? fmtNum(r.symbols) : '?',
      r.ok ? fmtNum(r.edges) : '?',
      fmtRelTime(r.mtime),
      short(r.project),
    ])
  );
  console.log(`\n  Open one:  codegraph-viz open <#>   |   codegraph-viz --project=<path>\n`);
}

export default {
  name: 'project',
  summary: 'list all indexed projects on this machine (`project ls`)',
  usage: 'project ls [--scan=<dir>] [--json]',
  run,
};
