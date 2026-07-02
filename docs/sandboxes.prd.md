# PRD: Sandboxes

**Status:** Draft  
**Project:** gent  
**Feature:** Sandbox Registry & Execution Isolation

---

# 1. Summary

Introduce **Sandboxes** as a first-class concept within `gent`.

A sandbox defines the execution environment in which an agent runs. It encapsulates container runtime configuration, filesystem access, networking, permissions, environment variables, and lifecycle management.

Profiles determine **what an agent knows** (skills, context, tools, MCP servers, prompts).

Sandboxes determine **where and how an agent executes**.

This separation allows the same profile to run in different environments without modifying the profile itself.

Examples:

- A Coding profile running locally.
- The same Coding profile running inside a Docker/Podman container.
- The same Coding profile running inside an Apple microVM.
- A Security profile running in a completely isolated environment.

---

# 2. Goals

- Make execution isolation deterministic.
- Decouple execution environment from agent behavior.
- Support multiple container runtimes.
- Allow reusable sandbox definitions.
- Make sandbox creation accessible from both CLI and UI.
- Enable secure execution of less-trusted agents.
- Keep sandbox definitions portable and version-controlled.

---

# 3. Non-Goals

Version 1 will not include:

- Distributed orchestration
- Kubernetes support
- Cloud execution
- Multi-node scheduling
- Auto-scaling
- Remote execution

These may be introduced later as additional sandbox drivers.

---

# 4. Core Concepts

## Profile

Defines:

- Context and memories
- Skills
- MCP servers
- Prompts
- Tool access

Answers:

> What should this agent know?

---

## Sandbox

Defines:

- Runtime
- Isolation
- Filesystem
- Networking
- Environment
- Security
- Lifecycle

Answers:

> Where should this agent run?

---

## Session

A session combines:

```
Profile
    +
Sandbox
    +
Prompt
    +
Runtime
```

Resulting in an isolated execution environment.

---

# 5. Architecture

```
                gent

        +-----------------+
        |    Profiles     |
        +-----------------+
                 |
                 |
                 v
        +-----------------+
        |   Sandboxes     |
        +-----------------+
                 |
                 |
      +----------+----------+
      |          |          |
      v          v          v

   Podman     Docker    Apple Container
                              |
                         Virtualization
                         Framework

```

The CLI interacts only with the Sandbox API.

Individual runtimes are implemented as interchangeable drivers.

---

# 6. Sandbox Drivers

Version 1 should support:

## Local

Runs directly on the host.
Isolation: None
Useful for:
- Testing
- Fast iteration
- Existing workflows

---

## Apple Container

Uses Apple's `container` runtime.
Ideal for:
- Apple Silicon
- Per-container microVM isolation
- Running less-trusted agents
- Local secure execution

---

## Podman

Runs agents inside Podman containers.
Supports:
- Rootless containers
- OCI images
- Volume mounts
- Network policies
Primary runtime for Linux.

---

## Docker

Runs agents inside Docker containers.
Provides compatibility with existing development environments.

---

Drivers should implement the same interface.

---

# 7. Sandbox Definition

Each sandbox is stored as a version-controlled configuration file.

Example:

```yaml
id: dev
name: Development Sandbox
driver: container # Apple container
image: ghcr.io/company/gent-agent:latest
workdir: /workspace
mounts:
  - source: ~/Projects/app
    target: /workspace
    mode: rw
  - source: ~/.config/gent/context
    target: /gent/context
    mode: ro
environment:
  GENT_PROFILE: coding
network:
  mode: restricted
security:
  filesystem: scoped
  shell: true
  host_network: false
  privileged: false
resources:
  cpu: 4
  memory: 8G
```

---

# 8. CLI

## Create
```
gent add sandbox
```

Interactive wizard.

---

```
gent add sandbox podman
```

Create using a template.

---

## List

```
gent sandbox list
```

---

## Inspect

```
gent sandbox inspect dev
```

---

## Edit

```
gent sandbox edit dev
```

---

## Remove

```
gent sandbox remove dev
```

---

## Validate

```
gent sandbox validate dev
```

Checks:

- mounts
- runtime availability
- image existence
- permissions

---

## Run

```
gent sandbox run dev
```

Starts the environment.

---

## Execute

```
gent sandbox exec dev -- codex
```

Runs a command inside the sandbox.

---

## Logs

```
gent sandbox logs dev
```

---

## Stop

```
gent sandbox stop dev
```

---

## Destroy

```
gent sandbox destroy dev
```

---

# 9. Profile Integration

Profiles reference sandboxes.

Example:

```yaml
id: coding

sandbox: dev
```

Changing the sandbox should not require modifying any other part of the profile.

This allows:

```
Coding Profile

↓

Podman

```

or

```
Coding Profile

↓

Apple Container

```

without changing context.

---

# 10. Extension UI

Add a Sandboxes section.

```
Sandboxes

+ Add Sandbox

Development

Apple VM

Secure Agent

Docker

Podman
```

Each sandbox displays:

- Name
- Driver
- Image
- Status
- Runtime
- Resource usage

---

Selecting a sandbox opens:

General

Filesystem

Networking

Environment

Security

Resources

Advanced

---

# 11. Profile UI

Each profile gains:

```
Execution

Sandbox

▼ Development Sandbox
```

Changing the selection updates only the execution environment.

---

# 12. Security Model

Every sandbox explicitly defines:

Filesystem access

Environment variables

Networking

Capabilities

Mounted secrets

Runtime

Privilege level

Nothing should be implicitly inherited.

---

# 13. Filesystem Access

Supported modes:

```
Read Only

Read Write

Temporary

Hidden
```

Common mounts:

```
Project

Gent Context

Home

SSH

Git Config

Caches
```

---

# 14. Networking

Modes:

```
None

Restricted

Full
```

Future support:

- allow lists
- deny lists
- proxies

---

# 15. Resources

Optional limits:

CPU

Memory

Disk

Temporary storage

Timeout

---

# 16. Runtime Lifecycle

Support:

Persistent

Ephemeral

Auto-remove

Always-running

On-demand

Apple Container "machine" environments fit naturally into the persistent lifecycle model.

---

# 17. Templates

Ship built-in templates.

## Development

- Podman
- Project mounted
- Network enabled

---

## Secure Agent

- Apple Container
- Minimal permissions
- Restricted networking

---

## Docker Compatibility

- Docker runtime
- Broad compatibility

---

## Local

- No isolation
- Fastest startup

---

# 18. Future Drivers

Potential future support:

- Kubernetes
- Lima
- Firecracker
- Incus
- LXC
- AWS ECS
- Azure Container Apps
- GitHub Codespaces
- Dev Containers
- Remote SSH
- Nomad

---

# 19. Directory Structure

```
.gent/

    profiles/

    sandboxes/

    skills/

    tools/

    mcp/

    prompts/

    runs/
```

---

# 20. Example Workflow

```
gent add sandbox podman

↓

gent add profile coding

↓

Assign sandbox

↓

gent run coding

↓

Agent starts inside sandbox

↓

Context loaded

↓

Prompt executed

↓

Session ends

↓

Sandbox stopped (if ephemeral)
```

---

# 21. Success Metrics

- Sandboxes can be reused across multiple profiles.
- Adding a new runtime requires only implementing a new driver.
- Profiles remain independent of runtime implementation details.
- Execution environments are reproducible across machines that support the selected runtime.
- Developers can switch execution environments without modifying profile configuration.
- Sandboxes are fully declarative, version-controlled, and portable.