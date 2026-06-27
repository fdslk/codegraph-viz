// src/db.mjs — open codegraph's SQLite read-only and figure out its schema.

/* CONFIG: leave null to auto-detect. If detection is wrong (see `/api/schema`
 * or `codegraph-viz project ls --json`), hardcode the right names here. */
export const CONFIG = {
  nodesTable: null, edgesTable: null, filesTable: null,
  nodeId: null, nodeName: null, nodeKind: null, nodeFile: null,
  edgeSource: null, edgeTarget: null, edgeKind: null,
  fileId: null, filePath: null,
};

/** Open a db read-only. Returns { all, get, close, driver }. */
export async function openDb(path) {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(path, { readOnly: true });
    return {
      all: (sql, p = []) => db.prepare(sql).all(...p),
      get: (sql, p = []) => db.prepare(sql).get(...p),
      close: () => db.close(),
      driver: 'node:sqlite',
    };
  } catch (e1) {
    try {
      const mod = await import('better-sqlite3');
      const Database = mod.default || mod;
      const db = new Database(path, { readonly: true, fileMustExist: true });
      return {
        all: (sql, p = []) => db.prepare(sql).all(...p),
        get: (sql, p = []) => db.prepare(sql).get(...p),
        close: () => db.close(),
        driver: 'better-sqlite3',
      };
    } catch (e2) {
      const err = new Error(
        'No SQLite driver. Use Node 24, or `node --experimental-sqlite` on 22.x, ' +
        'or `npm i better-sqlite3`.\n' +
        `  node:sqlite: ${e1.message}\n  better-sqlite3: ${e2.message}`
      );
      err.code = 'NO_SQLITE';
      throw err;
    }
  }
}

const SKIP = /(_fts$|_data$|_idx$|_content$|_docsize$|_config$|^sqlite_)/i;
const pick = (cols, re) => (cols.find((c) => re.test(c.name)) || {}).name || null;
const pkInt = (cols) => (cols.find((c) => c.pk && /int/i.test(c.type || '')) || {}).name || null;

function realTables(db) {
  return db.all("SELECT name, sql FROM sqlite_master WHERE type='table'")
    .filter((r) => !SKIP.test(r.name) && !/VIRTUAL TABLE/i.test(r.sql || ''))
    .map((r) => ({ name: r.name, cols: db.all(`PRAGMA table_info("${r.name}")`) }));
}

/** Heuristically detect nodes/edges/files tables and their key columns. */
export function detectSchema(db) {
  const tables = realTables(db);
  const S = { ...CONFIG, tables: tables.map((t) => ({ name: t.name, columns: t.cols.map((c) => c.name) })) };

  if (!S.nodesTable) {
    let best = null, score = -1;
    for (const t of tables) {
      const name = pick(t.cols, /^(name|symbol|label|identifier|ident)$/i) || pick(t.cols, /name/i);
      if (!name) continue;
      const kind = pick(t.cols, /^(kind|type|node_kind|nodekind|category)$/i);
      let s = 2 + (kind ? 2 : 0) + (/^(nodes?|symbols?)$/i.test(t.name) ? 4 : 0);
      if (s > score) { score = s; best = { t, name, kind }; }
    }
    if (best) {
      S.nodesTable = best.t.name;
      S.nodeName ??= best.name;
      S.nodeKind ??= best.kind;
      S.nodeId ??= pkInt(best.t.cols) || pick(best.t.cols, /^id$/i);
      S.nodeFile ??= pick(best.t.cols, /^(file|path|file_path|filepath|file_id|fileid|source_file)$/i);
    }
  }

  if (!S.edgesTable) {
    const srcRe = /^(source|src|from|from_id|source_id|src_id|caller|parent|head)$/i;
    const tgtRe = /^(target|dst|to|to_id|target_id|dst_id|callee|child)$/i;
    let best = null, score = -1;
    for (const t of tables) {
      const src = pick(t.cols, srcRe), tgt = pick(t.cols, tgtRe);
      if (!src || !tgt || src === tgt) continue;
      const s = 5 + (/^(edges?|relationships?|rels?)$/i.test(t.name) ? 4 : 0);
      if (s > score) { score = s; best = { t, src, tgt, kind: pick(t.cols, /^(kind|type|edge_kind|edgekind|rel|relation|label)$/i) }; }
    }
    if (best) {
      S.edgesTable = best.t.name;
      S.edgeSource ??= best.src;
      S.edgeTarget ??= best.tgt;
      S.edgeKind ??= best.kind;
    }
  }

  if (!S.filesTable) {
    const t = tables.find((t) => /^(files?|paths?)$/i.test(t.name) && pick(t.cols, /^(path|file_path|filepath|name)$/i));
    if (t) {
      S.filesTable = t.name;
      S.fileId ??= pkInt(t.cols) || pick(t.cols, /^(id|file_id)$/i);
      S.filePath ??= pick(t.cols, /^(path|file_path|filepath)$/i) || pick(t.cols, /^name$/i);
    }
  }
  return S;
}

/** Lightweight metadata for `project ls` — opens, counts, closes. Never loads the full graph. */
export async function quickStats(dbPath) {
  let db;
  try {
    db = await openDb(dbPath);
    const S = detectSchema(db);
    const count = (tbl) => {
      try { return db.get(`SELECT COUNT(*) AS c FROM "${tbl}"`)?.c ?? null; } catch { return null; }
    };
    return {
      ok: !!(S.nodesTable && S.edgesTable),
      symbols: S.nodesTable ? count(S.nodesTable) : null,
      edges: S.edgesTable ? count(S.edgesTable) : null,
      nodesTable: S.nodesTable, edgesTable: S.edgesTable,
    };
  } catch (e) {
    return { ok: false, error: e.message, symbols: null, edges: null };
  } finally {
    try { db?.close(); } catch {}
  }
}
