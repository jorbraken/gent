# Where gent keeps its state

gent keeps all of its state under one directory, `.gent`, whether that's the
global `~/.gent` or a project-local `.gent/` created by `gent create
scaffold`. Within it, two independent kinds of data live side by side:

## Profiles, MCP servers, skills (YAML)

YAML files that define coding-agent profiles (`gent create profile`, `gent
show profile`, `gent update profile`, `gent delete profile`) and the MCP
server registry (`gent add mcp`, `gent list mcp`, `gent update mcp`, `gent
delete mcp`).

- `.gent/config.yaml` — MCP server registry and `extends`/`extend_global`
  config.
- `.gent/profiles/<name>.yaml` — one file per profile.
- `.gent/skills/` — skill directories referenced by profiles.
- Resolution walks up from `cwd` to find the nearest `.gent/`, falling back
  to `~/.gent`. A project-local `.gent/` can `extends`/`extend_global` to
  inherit from `~/.gent` or another project-local `.gent` dir.

## Projects, tasks, bugs, comments, changelog, memory (SQLite)

SQLite-backed project tracking (`gent create project`, `gent add task|bug|
comment|changelog|memory`, and their `list`/`show`/`update`/`delete`/`done`
counterparts).

- `~/.gent/projects.db` — the global project registry: every project's name,
  root path, and per-project database path. Always lives in the global
  `~/.gent`, regardless of any project-local `.gent/` in play, since it has
  to be reachable from anywhere a project might be registered.
- `<project-root>/.gent/project.db` — one database per registered project,
  holding that project's tasks, bugs, comments, changelog entries, and
  memories. Created by `gent create project`, alongside that project's own
  `.gent/` folder if it has one.
- A project is resolved from `--project <name-or-id>` if passed, otherwise
  inferred from whichever registered project's root path contains the
  current working directory. Ambiguous or unresolved cwd matches raise an
  error asking for `--project`.
