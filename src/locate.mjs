// src/locate.mjs — find the current project's db, and discover all indexed projects.

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

const DB_REL = join('.codegraph', 'codegraph.db');
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'vendor', 'dist', 'build', 'target',
  '.venv', 'Pods', '.next', '.cache', 'Library', '.Trash',
]);

/** Walk up from `start` looking for ./.codegraph/codegraph.db. */
export function findDbUpward(start = process.cwd()) {
  let dir = resolve(start);
  for (let i = 0; i < 16; i++) {
    const p = join(dir, DB_REL);
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Default roots to scan on macOS. */
export function defaultRoots() {
  const h = homedir();
  return [process.cwd(), ...['projects', 'code', 'dev', 'work', 'src', 'repos', 'Documents/code', 'Documents']
    .map((d) => join(h, d))].filter((p) => existsSync(p));
}

/**
 * Find every .codegraph/codegraph.db under the given roots (bounded depth).
 * Returns [{ project, db, root }] de-duplicated by db path.
 */
export async function scanProjects(roots = defaultRoots(), maxDepth = 4) {
  const found = new Map();
  async function walk(dir, depth) {
    if (depth > maxDepth) return;
    const db = join(dir, DB_REL);
    if (existsSync(db)) found.set(db, { project: dir, db });
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      await walk(join(dir, e.name), depth + 1);
    }
  }
  for (const r of roots) await walk(resolve(r), 0);
  return [...found.values()];
}
