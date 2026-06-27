# codegraph-viz

Local web visualizer for [codegraph](https://github.com/colbymchenry/codegraph)'s
knowledge graph. Reads `.codegraph/codegraph.db` **read-only** and serves three
views — architecture overview, file dependencies, call graph — in your browser.
macOS-focused. One command to launch.

## Requirements

- **Node 24** (built-in SQLite, zero setup) — recommended.
- Node 22.5+ works too, but run with `node --experimental-sqlite`, or `npm i better-sqlite3`.
- A project you've already run `codegraph init` in.

## Install

Install the `codegraph-viz` command globally from npm (zero dependencies, no
build step):

```bash
npm install -g @fdslk/codegraph-viz
```

The command is `codegraph-viz`. Upgrade by re-running the install; uninstall
with `npm uninstall -g @fdslk/codegraph-viz`.

Working on the tool itself? Clone and link instead:

```bash
git clone https://github.com/fdslk/codegraph-viz.git
cd codegraph-viz
npm link               # makes the `codegraph-viz` command global (dev)
```

## Use

```bash
# inside a codegraph-indexed project — opens the browser automatically
codegraph-viz
# or without global link:
npm run viz

# see every indexed project on this machine
codegraph-viz project ls
codegraph-viz project ls --json
codegraph-viz project ls --scan=~/somewhere --depth=5

# open a specific one
codegraph-viz open 2
codegraph-viz --project=~/projects/my-app
codegraph-viz --db=/abs/path/.codegraph/codegraph.db

# options
codegraph-viz --port=7700 --no-open
codegraph-viz --help
```

## Layout

```
bin/cli.mjs            entry point — routes subcommands
src/commands/          one file per subcommand (registered in index.mjs)
  serve.mjs            default: open a project
  project-ls.mjs       `project ls`
  open.mjs             `open <#|path>`
  _template.mjs        copy this to add a command
src/db.mjs             sqlite driver + schema auto-detection (CONFIG override)
src/locate.mjs         find .codegraph upward / scan for projects
src/views.mjs          graph loading + the three view aggregations
src/server.mjs         HTTP API + serves the frontend
public/index.html      frontend shell (Cytoscape render hook marked TODO)
```

## If the graph is empty / wrong

codegraph's exact table names aren't part of its public API, so this tool
auto-detects them. If detection misses:

1. Open `http://localhost:7700/api/schema` (or `codegraph-viz project ls --json`).
2. Set the correct table/column names in `CONFIG` at the top of `src/db.mjs`.
3. Restart.

Most common failure: edges reference node **ids** but matched against the wrong
node column — check that `edgeSource`/`edgeTarget` values line up with `nodeId`.

## Add a subcommand

1. `cp src/commands/_template.mjs src/commands/mycommand.mjs` and edit it.
2. Import it in `src/commands/index.mjs` and add it to `COMMANDS`.

That's it — `bin/cli.mjs` routes by the command's `name` automatically.
```

## Frontend render hook

The backend is fully wired; the frontend is a shell. In `public/index.html`,
fill in `render(view, data)` (marked with `RENDER HOOK`) to mount Cytoscape into
`#graph`. `data` is `{ view, nodes, edges, truncated }`.
