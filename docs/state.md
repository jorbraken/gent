# Where gent keeps its state

gent manages two independent kinds of state, in two separate directories. They
are not merged into one namespace because their resolution models are
incompatible: `.gent` is a YAML-based, directory-tree-walking config format;
`.opsys` is a SQLite-backed project registry keyed by explicit registration,
not directory position.

## `~/.gent` — profiles, MCP servers, skills

YAML files that define coding-agent profiles (`gent create profile`, `gent
show profile`, `gent update profile`, `gent delete profile`) and the MCP
server registry (`gent add mcp`, `gent list mcp`, `gent update mcp`, `gent
delete mcp`).

- `~/.gent/config.yaml` — global MCP server registry and `extends`/
  `extend_global` config.
- `~/.gent/profiles/<name>.yaml` — one file per profile.
- `~/.gent/skills/` — skill directories referenced by profiles.
- Project-local `.gent/` folders (`gent create scaffold`, `gent list
  scaffold`) work the same way, and can `extends`/`extend_global` to inherit
  from `~/.gent` or other project-local `.gent` dirs. Resolution walks up
  from `cwd` to find the nearest `.gent/`, falling back to `~/.gent`.

## `~/.opsys` — projects, tasks, bugs, comments, changelog, memory

SQLite-backed project tracking (`gent create project`, `gent add task|bug|
comment|changelog|memory`, and their `list`/`show`/`update`/`delete`/`done`
counterparts).

- `~/.opsys/projects.db` — the global project registry: every project's
  name, root path, and per-project database path.
- `<project-root>/.opsys/project.db` — one database per registered project,
  holding that project's tasks, bugs, comments, changelog entries, and
  memories.
- A project is resolved from `--project <name-or-id>` if passed, otherwise
  inferred from whichever registered project's root path contains the
  current working directory. Ambiguous or unresolved cwd matches raise an
  error asking for `--project`.
