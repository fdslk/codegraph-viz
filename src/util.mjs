// src/util.mjs — small shared helpers, no dependencies.

import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import net from 'node:net';

// ponytail: expand a leading ~ that the shell left literal (e.g. --project=~/foo).
const expandHome = (v) =>
  typeof v === 'string' && (v === '~' || v.startsWith('~/')) ? homedir() + v.slice(1) : v;

/** Parse argv into { _: [positionals], flags }. Supports --k=v, --flag, -h. */
export function parseArgs(argv) {
  const out = { _: [] };
  for (const a of argv) {
    if (a.startsWith('--')) {
      const m = a.slice(2).match(/^([^=]+)(?:=(.*))?$/);
      out[m[1]] = m[2] === undefined ? true : expandHome(m[2]);
    } else if (a.startsWith('-') && a.length > 1) {
      for (const ch of a.slice(1)) out[ch] = true;
    } else {
      out._.push(a);
    }
  }
  return out;
}

/** mtime (ms, rounded) of a sqlite db, taking WAL sidecar into account. */
export async function dbMtime(dbPath) {
  let m = 0;
  for (const t of [dbPath, dbPath + '-wal']) {
    try { m = Math.max(m, (await stat(t)).mtimeMs); } catch {}
  }
  return Math.round(m);
}

export function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return '?';
  return n.toLocaleString('en-US');
}

export function fmtRelTime(ms) {
  if (!ms) return '?';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return 'just now';
  const m = s / 60; if (m < 90) return `${Math.round(m)}m ago`;
  const h = m / 60; if (h < 36) return `${Math.round(h)}h ago`;
  const d = h / 24; if (d < 14) return `${Math.round(d)}d ago`;
  const w = d / 7; if (w < 9) return `${Math.round(w)}w ago`;
  return `${Math.round(d / 30)}mo ago`;
}

/** Print an aligned text table. headers: string[]; rows: string[][]. */
export function printTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)));
  const line = (cells) =>
    '  ' + cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ');
  console.log(line(headers));
  for (const r of rows) console.log(line(r));
}

/** Find a free port starting at `start`, trying a few above it. */
export function findFreePort(start, attempts = 20) {
  return new Promise((resolve, reject) => {
    let port = start, tried = 0;
    const tryPort = () => {
      const srv = net.createServer();
      srv.once('error', (e) => {
        srv.close();
        if (e.code === 'EADDRINUSE' && tried++ < attempts) { port++; tryPort(); }
        else reject(e);
      });
      srv.once('listening', () => srv.close(() => resolve(port)));
      srv.listen(port, '127.0.0.1');
    };
    tryPort();
  });
}
