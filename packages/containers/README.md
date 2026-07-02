# gent container images

Runtime OCI images for running coding agents inside [Apple Container](https://github.com/apple/container) sandboxes. Each image installs one agent CLI on top of a shared Debian base — no fixed entrypoint, so `gent` can exec the binary directly with profile-composed flags.

## Prerequisites

- Apple Silicon Mac
- [Apple `container` CLI](https://github.com/apple/container) on `PATH`

Images target `linux/arm64` to match Apple Container on Apple Silicon.

## Build

From the repo root:

```bash
pnpm build:containers
```

Or from this directory:

```bash
pnpm build
```

Build order matters: `gent-base` first, then the agent images.

| Tag | Agent binary | Install |
|-----|--------------|---------|
| `gent-base` | — | Debian bookworm-slim + git, curl, Node.js 22, Python 3 |
| `gent-claude` | `claude` | `@anthropic-ai/claude-code` |
| `gent-pi` | `pi` | `@earendil-works/pi-coding-agent` |
| `gent-codex` | `codex` | `@openai/codex` |

Individual builds:

```bash
pnpm build:base
pnpm build:claude
pnpm build:pi
pnpm build:codex
```

Verify a built image:

```bash
container images inspect gent-claude
```

## Use with gent sandboxes

Create a sandbox that references the image matching your profile's agent:

```yaml
# .gent/sandboxes/dev.yaml
driver: apple-container
image: gent-claude          # or gent-pi / gent-codex
workdir: /workspace
lifecycle: ephemeral
network: full               # agents need network for LLM calls
mounts:
  - source: ~/Projects/my-app
    target: /workspace
    mode: rw
```

Attach it to a profile:

```yaml
# ~/.gent/profiles/dev.yaml
sandbox: dev
agent: claude                 # must match the image's agent binary
```

Then validate and run:

```bash
gent sandbox dev validate
gent dev --dry-run
gent dev
```

The `apple-container` sandbox template defaults to `gent-claude`:

```bash
gent create sandbox apple-container
```
