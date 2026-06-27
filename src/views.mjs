// src/views.mjs — load the graph into memory and derive the three views.

const CALL_RE = /call/i;
const DEP_RE = /call|import|reference|extend|implement|type_of|instantiate|override|decorate/i;
const CONTAIN_RE = /contain|defines|child|member/i;
const SEP = String.fromCharCode(1); // map-key separator that can't appear in a path

/** Load full graph from an open db using a detected schema. Returns normalized structures. */
export function loadGraph(db, S) {
  if (!S.nodesTable || !S.edgesTable) return { error: 'schema-not-detected' };
  const q = (n) => `"${n}"`;

  const fileById = new Map();
  if (S.filesTable && S.filePath) {
    for (const r of db.all(`SELECT * FROM ${q(S.filesTable)}`)) {
      const id = S.fileId ? r[S.fileId] : r.rowid;
      fileById.set(String(id), r[S.filePath]);
    }
  }

  const nodes = new Map();
  const nodeKinds = new Set();
  const selN = S.nodeId
    ? `SELECT *, ${q(S.nodeId)} AS __id FROM ${q(S.nodesTable)}`
    : `SELECT *, rowid AS __id FROM ${q(S.nodesTable)}`;
  for (const r of db.all(selN)) {
    const id = String(r.__id);
    const kind = (S.nodeKind && r[S.nodeKind] != null) ? String(r[S.nodeKind]) : 'unknown';
    let file = null;
    if (S.nodeFile && r[S.nodeFile] != null) {
      const raw = String(r[S.nodeFile]);
      file = fileById.has(raw) ? fileById.get(raw) : raw;
    }
    nodes.set(id, { id, label: S.nodeName ? String(r[S.nodeName] ?? id) : id, kind, file });
    nodeKinds.add(kind);
  }

  const edges = [];
  const edgeKinds = new Set();
  const selE = `SELECT ${q(S.edgeSource)} AS s, ${q(S.edgeTarget)} AS t` +
    (S.edgeKind ? `, ${q(S.edgeKind)} AS k` : '') + ` FROM ${q(S.edgesTable)}`;
  for (const r of db.all(selE)) {
    const k = r.k != null ? String(r.k) : 'edge';
    edges.push({ s: String(r.s), t: String(r.t), k });
    edgeKinds.add(k);
  }

  // node -> file map, with fallback via "contains"-style edges from file/module nodes
  const fileOf = new Map();
  for (const [id, n] of nodes) if (n.file) fileOf.set(id, n.file);
  if (fileOf.size < nodes.size * 0.3) {
    for (const e of edges) {
      if (!CONTAIN_RE.test(e.k)) continue;
      const parent = nodes.get(e.s);
      if (parent && /file|module/i.test(parent.kind) && !fileOf.has(e.t)) fileOf.set(e.t, parent.label);
    }
  }

  return { nodes, edges, fileOf, nodeKinds: [...nodeKinds].sort(), edgeKinds: [...edgeKinds].sort() };
}

const fileOfId = (g, id) => g.fileOf.get(id) || (g.nodes.get(id) && g.nodes.get(id).file) || null;

function fileDepEdges(g) {
  const w = new Map();
  for (const e of g.edges) {
    if (!DEP_RE.test(e.k)) continue;
    const a = fileOfId(g, e.s), b = fileOfId(g, e.t);
    if (!a || !b || a === b) continue;
    const key = a + SEP + b;
    w.set(key, (w.get(key) || 0) + 1);
  }
  return w;
}
function symbolsPerFile(g) {
  const c = new Map();
  for (const [id, n] of g.nodes) {
    const f = fileOfId(g, id);
    if (f) c.set(f, (c.get(f) || 0) + 1);
  }
  return c;
}

// files under a folder prefix (''=everything). Returns a predicate on a path.
function underPrefix(prefix) {
  const base = (prefix || '').split('/').filter(Boolean);
  return (p) => { const parts = String(p).split('/').filter(Boolean); return base.every((b, i) => parts[i] === b); };
}

export function viewCallGraph(g, { file = null, limit = 400, focus = null, depth = 2, kind = null } = {}) {
  const callEdges = g.edges.filter((e) => CALL_RE.test(e.k));

  // scoped to one file: its functions + their direct callers/callees (external dimmed)
  if (file) {
    const inFile = new Set();
    for (const [id, n] of g.nodes) if (/function|method/i.test(n.kind) && fileOfId(g, id) === file) inFile.add(id);
    const keep = new Set(inFile);
    for (const e of callEdges) { if (inFile.has(e.s)) keep.add(e.t); if (inFile.has(e.t)) keep.add(e.s); }
    const nodes = [];
    for (const id of keep) {
      const n = g.nodes.get(id);
      if (n) nodes.push({ id, label: n.label, kind: n.kind, file: n.file, focus: inFile.has(id), external: !inFile.has(id) });
    }
    const edges = callEdges
      .filter((e) => (inFile.has(e.s) || inFile.has(e.t)) && keep.has(e.s) && keep.has(e.t))
      .map((e) => ({ source: e.s, target: e.t, kind: e.k }));
    return { view: 'callgraph', nodes, edges, truncated: false, file };
  }

  let keep;
  if (focus && g.nodes.has(focus)) {
    const adj = new Map();
    const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); };
    for (const e of callEdges) { link(e.s, e.t); link(e.t, e.s); }
    keep = new Set([focus]); let frontier = [focus];
    for (let d = 0; d < depth; d++) {
      const next = [];
      for (const id of frontier) for (const nb of adj.get(id) || []) if (!keep.has(nb)) { keep.add(nb); next.push(nb); }
      frontier = next;
    }
  } else {
    const deg = new Map();
    for (const e of callEdges) { deg.set(e.s, (deg.get(e.s) || 0) + 1); deg.set(e.t, (deg.get(e.t) || 0) + 1); }
    let ids = [...deg.entries()];
    if (kind) ids = ids.filter(([id]) => g.nodes.get(id)?.kind === kind);
    ids.sort((a, b) => b[1] - a[1]);
    keep = new Set(ids.slice(0, limit).map(([id]) => id));
  }
  const nodes = [];
  for (const id of keep) { const n = g.nodes.get(id); if (n) nodes.push({ id, label: n.label, kind: n.kind, file: n.file, focus: id === focus }); }
  const edges = callEdges.filter((e) => keep.has(e.s) && keep.has(e.t)).map((e) => ({ source: e.s, target: e.t, kind: e.k }));
  return { view: 'callgraph', nodes, edges, truncated: !focus && keep.size >= limit };
}

export function viewFileDeps(g, { prefix = '', limit = 600 } = {}) {
  const under = underPrefix(prefix);
  const w = fileDepEdges(g), cnt = symbolsPerFile(g);
  const inFolder = new Set([...cnt.keys()].filter(under));   // every file in the folder, even if isolated
  const ext = new Set();                                     // outside files the folder depends on / is used by
  const edges = [];
  for (const [key, weight] of w) {
    const [a, b] = key.split(SEP);
    if (!under(a) && !under(b)) continue;                    // edge must touch the folder
    if (!under(a)) ext.add(a);
    if (!under(b)) ext.add(b);
    edges.push({ source: a, target: b, weight });
  }
  const mk = (f, external) => ({ id: f, label: f.split('/').pop(), path: f, size: cnt.get(f) || 1, kind: 'file', external });
  let nodes = [...[...inFolder].map((f) => mk(f, false)), ...[...ext].map((f) => mk(f, true))];
  if (nodes.length > limit) {
    const folderNodes = nodes.filter((n) => !n.external).sort((a, b) => b.size - a.size).slice(0, limit);
    const keep = new Set(folderNodes.map((n) => n.id));
    const keptEdges = edges.filter((e) => keep.has(e.source) || keep.has(e.target));
    for (const e of keptEdges) { keep.add(e.source); keep.add(e.target); }
    nodes = nodes.filter((n) => keep.has(n.id));
    return { view: 'filedeps', nodes, edges: keptEdges.filter((e) => keep.has(e.source) && keep.has(e.target)), truncated: true, prefix };
  }
  return { view: 'filedeps', nodes, edges, truncated: false, prefix };
}

// One level of folders/files directly under `prefix` (''=repo root). Single-child
// folder chains are collapsed into one hop (java/com/xm), like an IDE tree.
export function viewArchitecture(g, { prefix = '' } = {}) {
  const under = underPrefix(prefix);
  const base = prefix.split('/').filter(Boolean);
  const cnt = symbolsPerFile(g), w = fileDepEdges(g);
  const files = [...cnt.keys()].filter(under).map((p) => p.split('/').filter(Boolean));

  // map a file's parts -> its collapsed group {name, deeper}, descending through
  // single-child folders until the path branches or hits a file.
  const cache = new Map();
  const groupOf = (p) => {
    if (cache.has(p)) return cache.get(p);
    const parts = p.split('/').filter(Boolean);
    if (!under(p) || parts.length <= base.length) { cache.set(p, null); return null; }
    let d = base.length + 1;
    while (d < parts.length) {
      const pre = parts.slice(0, d).join('/');
      const kids = new Set(); let fileHere = false;
      for (const f of files) {
        if (f.slice(0, d).join('/') !== pre) continue;
        if (f.length === d) fileHere = true; else kids.add(f[d]);
      }
      if (kids.size <= 1 && !fileHere) d++; else break;
    }
    const grp = { name: parts.slice(0, d).join('/'), deeper: parts.length > d };
    cache.set(p, grp);
    return grp;
  };

  const size = new Map(), expandable = new Map();
  for (const [f, c] of cnt) {
    const grp = groupOf(f);
    if (!grp) continue;
    size.set(grp.name, (size.get(grp.name) || 0) + c);
    expandable.set(grp.name, (expandable.get(grp.name) || false) || grp.deeper);
  }
  const fe = new Map();
  for (const [key, weight] of w) {
    const [a, b] = key.split(SEP);
    const ga = groupOf(a), gb = groupOf(b);
    if (!ga || !gb || ga.name === gb.name) continue;
    const k = ga.name + SEP + gb.name;
    fe.set(k, (fe.get(k) || 0) + weight);
  }
  const strip = (id) => (prefix ? id.slice(prefix.length + 1) : id);
  const nodes = [...size.entries()].map(([id, s]) => ({
    id, label: strip(id), path: id, size: s,
    kind: expandable.get(id) ? 'folder' : 'file', expandable: !!expandable.get(id),
  }));
  const edges = [...fe.entries()].map(([k, weight]) => { const [source, target] = k.split(SEP); return { source, target, weight }; });
  return { view: 'architecture', nodes, edges, truncated: false, prefix };
}

export function searchNodes(g, term, limit = 60) {
  const q = term.toLowerCase(); const out = [];
  if (!q) return out;
  for (const [, n] of g.nodes) {
    if (n.label.toLowerCase().includes(q)) { out.push({ id: n.id, label: n.label, kind: n.kind, file: n.file }); if (out.length >= limit) break; }
  }
  return out;
}
