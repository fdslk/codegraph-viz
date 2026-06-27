// src/commands/open.mjs — `codegraph-viz open <#|path>`

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanProjects, defaultRoots } from '../locate.mjs';
import { dbMtime } from '../util.mjs';
import serve from './serve.mjs';

async function run(args) {
  const target = args._[1];
  if (!target) {
    console.error('  Usage: codegraph-viz open <#|path>   (see numbers via: codegraph-viz project ls)');
    process.exit(1);
  }

  // numeric -> index into the same sorted scan list used by `project ls`
  if (/^\d+$/.test(String(target))) {
    const roots = args.scan ? [resolve(args.scan)] : defaultRoots();
    const projects = await scanProjects(roots, Number(args.depth) || 4);
    const withTime = [];
    for (const p of projects) withTime.push({ ...p, mtime: await dbMtime(p.db) });
    withTime.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
    const idx = Number(target) - 1;
    if (idx < 0 || idx >= withTime.length) {
      console.error(`  No project #${target}. Run: codegraph-viz project ls`);
      process.exit(1);
    }
    return serve.run({ ...args, project: withTime[idx].project, _: [] });
  }

  // existing path -> treat as project dir
  const dir = resolve(String(target));
  if (existsSync(dir)) return serve.run({ ...args, project: dir, _: [] });

  // otherwise match by project name against the scan list
  const roots = args.scan ? [resolve(args.scan)] : defaultRoots();
  const projects = await scanProjects(roots, Number(args.depth) || 4);
  const hits = projects.filter((p) => p.project.split('/').pop() === String(target));
  if (hits.length === 1) return serve.run({ ...args, project: hits[0].project, _: [] });
  if (hits.length > 1) {
    console.error(`  Multiple projects named "${target}". Use the # from: codegraph-viz project ls`);
    process.exit(1);
  }
  console.error(`  No project "${target}" (not a path, not an indexed name). Try: codegraph-viz project ls`);
  process.exit(1);
}

export default {
  name: 'open',
  summary: 'open a project by number (from `project ls`) or by path',
  usage: 'open <#|path>',
  run,
};
