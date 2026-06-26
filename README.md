# gent

![gent](assets/gent.png)

Claude Code environment profile manager. Instead of loading every MCP server and skill on every session, `gent` lets you define named profiles that each activate only the tools relevant to your current task — then launches `claude` with the right flags pre-composed.

```bash
gent dev           # launch claude with GitHub + fetch + memory, permissionMode: auto
gent pm            # launch claude with Linear + Jira + Notion + Slack + Confluence
gent dev,qa        # compose multiple profiles — union of their MCP servers/skills
gent               # interactive picker with multi-select and per-session MCP toggle
```

## Installation

```bash
git clone https://github.com/jorbraken/gent.git
cd gent
pnpm install:global   # builds and links the CLI globally
```

Requires Node.js ≥ 18 and [Claude Code](https://claude.ai/code).

## Quick start

```bash
# First-time setup — creates ~/.gent/config.yaml and your first profile
gent init

# List available profiles
gent list

# Run a profile
gent <profile>

# Preview the composed claude command without running it
gent <profile> --dry-run

# Pass extra flags through to claude
gent dev -- -p "fix the failing tests"
```

## Composing profiles

**CLI composition** — separate multiple profile names with commas to merge them on the fly:

```bash
gent dev,qa --dry-run    # union of dev + qa MCP servers, strict_mcp ORed, settings last-wins
```

**Interactive composition** — run `gent` with no args for a multi-select picker. After choosing profiles you get a second step to deselect individual MCP servers or skills for just this session.

**Static inheritance** — use `extends` in a profile YAML to inherit from another:

```yaml
# ~/.gent/profiles/dev-strict.yaml
extends: dev
settings:
  permissionMode: default   # override one field; rest inherited from dev
```

`extends` accepts a string or an array of parent names. Children always win over parents. Cycles are detected and rejected.

## Commands

| Command | Description |
|---|---|
| `gent [profile]` | Launch claude with a profile; interactive multi-select picker if omitted |
| `gent dev,qa` | Compose multiple profiles at runtime (comma-separated) |
| `gent list` | List all profiles |
| `gent init` | First-time setup wizard |
| `gent profile show <name>` | Print a profile's configuration |
| `gent profile create [name]` | Create a new profile via wizard |
| `gent profile edit <name>` | Open a profile in `$EDITOR` |
| `gent profile delete <name>` | Delete a profile |
| `gent mcp list` | List registered MCP servers |
| `gent mcp add` | Register a new MCP server |
| `gent mcp remove <name>` | Remove an MCP server |

## Configuration

All config lives in `~/.gent/`:

```
~/.gent/
├── config.yaml        # MCP server registry
└── profiles/
    ├── dev.yaml
    ├── pm.yaml
    └── ...
```

### MCP server registry (`~/.gent/config.yaml`)

Define the full catalog of available servers once. Profile `env` values support `${VAR}` interpolation from your shell environment.

```yaml
mcp_servers:
  github:
    type: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_PERSONAL_ACCESS_TOKEN}"

  playwright:
    type: stdio
    command: npx
    args: ["-y", "@playwright/mcp@latest", "--headless"]
```

### Profile format (`~/.gent/profiles/<name>.yaml`)

```yaml
name: dev                  # optional — filename always wins
extends: base              # optional: inherit from one or more parent profiles
description: Implementation — coding, code review, debugging
mcp:
  - github       # references keys in config.yaml
  - fetch
  - memory
strict_mcp: true           # block global MCP config from loading
skills:
  - ~/.gent/skills/dev/   # added to skillsDirectories
settings:
  model: claude-sonnet-4-6
  permissionMode: auto     # auto | default | bypassPermissions
  effortLevel: high
system_prompt_append: |
  Focus on clean, well-tested code.
```

The filename (`dev.yaml`) is always the profile name — the `name` field inside the YAML is ignored.

## Built-in SDLC profiles

Run `gent init` and choose from these or create your own:

| Profile | Phase | MCP servers |
|---|---|---|
| `pm` | Requirements | github, linear, jira, confluence, notion, slack, fetch |
| `designer` | Design | figma, github, notion, fetch |
| `dev` | Implementation | github, fetch, memory |
| `qa` | Testing | playwright, github, sentry, fetch |
| `sre` | Deployment | github, kubernetes, fetch |
| `ops` | Maintenance | github, sentry, datadog, fetch |

Each profile uses `--strict-mcp-config` so only its declared servers load. Set the relevant env vars (`GITHUB_PERSONAL_ACCESS_TOKEN`, `LINEAR_API_TOKEN`, `FIGMA_API_KEY`, etc.) in your shell.

## License

MIT © [jorbraken](https://github.com/jorbraken)
