# PRD: Gent — Deterministic Agent Context Harness

## 1. Summary

Gent is a local-first agent harness that lets users define, inspect, and run specialized LLM/agent profiles with deterministic context, skills, memories, decisions, and tool access.

The core product has two parts:

1. **`gent` CLI**  
   A portable runtime for compiling, previewing, inspecting, and running agent profiles.

2. **Gent UI**  
   A VS Code extension that provides a visual editor for configuring profiles, context packs, skills, MCP servers, memories, decisions, and workflows.

The main product promise:

> Design your agents visually. Run them anywhere with `gent <profile>`.

Gent should reduce context sprawl, prevent irrelevant skills/tools from leaking into tasks, and make every agent run inspectable and reproducible.

---

## 2. Problem

Developers increasingly use multiple LLMs and coding agents across tools such as ChatGPT, Codex, Claude Code, Cursor, Cline, Roo, Goose, and others. Each tool has its own way of handling instructions, skills, memory, MCP servers, prompts, and context.

This creates several problems:

- Context becomes scattered across chats, markdown files, rule files, IDE settings, prompts, MCP configs, and hidden memories.
- Agents often receive the wrong context for the task.
- Product/design work gets mixed with engineering/debugging context.
- Implementation agents may receive brainstorming context they do not need.
- Debugging agents may lack relevant historical decisions or QA patterns.
- Users cannot easily see what context an agent received before it runs.
- Agent behavior is hard to reproduce across machines, branches, tools, and teammates.
- Visual setup is missing; users must hand-edit configs, markdown, prompt fragments, or tool-specific files.
- Existing agent tools are powerful, but each acts as its own partial harness.

Gent solves this by becoming a deterministic local control plane for agent profiles and context assembly.

---

## 3. Product Goals

### Primary goals

- Let users create task-specific agent profiles such as:
  - Product Planner
  - UI/UX Refiner
  - Implementation Architect
  - Coder
  - Debugger
  - QA Reviewer
  - Release Assistant

- Let users define which context, memories, skills, MCP servers, and tools each profile can access.

- Provide a visual VS Code/Cursor extension for configuring and inspecting agent profiles.

- Provide a CLI runtime for portable execution:

  ```bash
  gent product
  gent architect
  gent coder
  gent qa
  ```

- Keep source of truth in readable, versionable files.

- Use a local compiled SQLite cache for fast search, indexing, and runtime access.

- Make context assembly deterministic, inspectable, and reproducible.

- Support exporting/generated config for other agents where possible.

---

## 4. Non-Goals

Gent v1 should not try to be:

- A full replacement for Cursor, Claude Code, Codex, Cline, Roo, or other coding agents.
- A hosted SaaS memory platform.
- A general-purpose vector database.
- A multi-user collaboration platform.
- A fully autonomous multi-agent swarm system.
- A hidden memory layer that mutates behavior without user visibility.
- A proprietary database where user context is trapped.

Gent should be the harness around existing agents, not necessarily the agent itself.

---

## 5. Target Users

### Primary user

A developer or technical lead who uses multiple LLM/agent tools and wants better control over context, skills, and task-specific agent behavior.

### Secondary users

- Small engineering teams using shared coding-agent rules.
- Indie hackers building several projects.
- Technical founders coordinating product, design, and engineering work with agents.
- Developers using local-first workflows.
- Developers who want markdown-readable memory and decision logs.
- Teams that want portable agent profiles committed to git.

---

## 6. Core Use Cases

### Use Case 1: Product planning

User wants to brainstorm and refine a feature idea.

Command:

```bash
gent product ./ideas/calendar-sync.md
```

Gent should include:

- Product context
- Roadmap notes
- User research
- Feature-scoping skills
- User-story writing skills
- Product decisions

Gent should exclude:

- Debugging skills
- Deployment tools
- Shell access
- Git write access
- Low-level QA automation context

---

### Use Case 2: UI/UX refinement

User has a feature brief and wants flows, states, and edge cases.

Command:

```bash
gent uiux ./plans/calendar-sync-feature-brief.md
```

Gent should include:

- Design context
- UI/UX principles
- Existing design decisions
- Screen/state modeling skills
- Accessibility guidelines

Gent should exclude:

- Backend implementation details unless explicitly referenced
- Debugging tools
- Deployment context

---

### Use Case 3: Implementation architecture

User wants a technical approach for a refined feature.

Command:

```bash
gent architect ./plans/calendar-sync-feature-brief.md
```

Gent should include:

- Engineering context
- Architecture decisions
- Codebase map
- Tech constraints
- API/data-model skills
- Testing strategy skills

Gent should exclude:

- Open-ended product brainstorming skills
- Marketing copy skills
- UI polish context unless needed

---

### Use Case 4: Coding

User wants an implementation agent with coding-focused context.

Command:

```bash
gent coder ./plans/calendar-sync-tech-approach.md
```

Gent should include:

- Relevant codebase instructions
- Coding standards
- Allowed implementation skills
- Git read tools
- Filesystem read/write tools, depending on profile permissions
- Test-running tools, if enabled

Gent should exclude:

- Product ideation context
- Design exploration context
- Irrelevant historical notes

---

### Use Case 5: Debugging

User wants a debugging-focused profile.

Command:

```bash
gent debugger "The sync job fails when OAuth expires"
```

Gent should include:

- Debugging skills
- Logs and known incidents, if available
- QA notes
- Engineering decisions
- Reproduction templates
- Git diff/log tools

Gent should exclude:

- Product discovery skills
- UI/UX brainstorming context
- Release planning unless explicitly requested

---

### Use Case 6: Full feature pipeline

User wants a deterministic multi-step workflow.

Command:

```bash
gent pipeline feature ./ideas/calendar-sync.md
```

Pipeline:

```text
Product Planner
→ UI/UX Refiner
→ Implementation Architect
→ QA Reviewer
```

Output:

```text
.gent/runs/2026-07-01-calendar-sync/
├── 01-feature-brief.md
├── 02-uiux-flow.md
├── 03-tech-approach.md
├── 04-qa-plan.md
└── run.json
```

---

## 7. Product Principles

### 7.1 Files are the source of truth

Users should be able to inspect, edit, diff, review, and commit their agent configuration.

Canonical files should live in the repo:

```text
.gent/
  profiles/
  context-packs/
  skills/
  memories/
  decisions/
  pipelines/
```

The compiled database is a cache, not the source of truth.

---

### 7.2 SQLite is the compiled runtime layer

Gent should compile markdown/YAML/source files into a local SQLite database for:

- Fast lookup
- Full-text search
- Metadata filtering
- Context assembly
- Run history
- Decision indexing
- File hashing
- Change detection

The database should be regenerable:

```bash
gent sync
gent compile
```

The database may be committed only if the project explicitly opts into that workflow.

---

### 7.3 Deterministic before semantic

Gent should prefer explicit rules, tags, profiles, and allowlists before using semantic retrieval.

Order of context assembly:

1. Resolve profile.
2. Resolve task stage.
3. Load required profile instructions.
4. Load explicitly included context packs.
5. Apply excludes.
6. Resolve allowed tools/MCP servers.
7. Load scoped memories.
8. Load relevant decisions.
9. Use search/retrieval only inside the allowed scope.
10. Produce previewable context bundle.

Semantic search should never be allowed to override profile boundaries.

---

### 7.4 Inspectability is mandatory

Users should be able to inspect exactly what an agent will receive.

Example:

```bash
gent inspect architect
gent preview architect ./plans/calendar-sync.md
```

Output should show:

- Included files
- Excluded files
- Included skills
- Included context packs
- Included memories
- Included decisions
- Enabled tools
- Disabled tools
- Enabled MCP servers
- Token estimate
- Reason each item was included

---

### 7.5 Profiles are first-class

Profiles are not just prompt templates. They define:

- Role
- Purpose
- When to use
- Context packs
- Skills
- Memory scopes
- Tool permissions
- MCP permissions
- Writeback behavior
- Output expectations
- Export targets

---

### 7.6 Studio is the human UX

Users should not need to understand every markdown/YAML file manually.

The VS Code/Cursor extension should provide:

- Profile editor
- Context pack editor
- Skill browser
- MCP permission manager
- Memory viewer/editor
- Decision log
- Context preview
- Pipeline builder
- Run history

The extension edits project files. It does not replace them.

---

## 8. Core Concepts

### 8.1 Profile

A profile defines an agent persona, purpose, allowed context, and capabilities.

Example profiles:

```text
product
uiux
architect
coder
debugger
qa
reviewer
release
```

Example file:

```text
.gent/profiles/architect.md
```

Example frontmatter:

```yaml
---
id: architect
name: Implementation Architect
description: Creates technical approaches for refined feature briefs.
stage: implementation-planning

context_packs:
  include:
    - engineering
    - architecture
    - active-feature
  exclude:
    - product-brainstorming
    - marketing

skills:
  include:
    - tech-approach
    - api-design
    - data-modeling
    - testing-strategy
  exclude:
    - product-discovery
    - marketing-copy

memory_scopes:
  include:
    - engineering
    - decisions
    - active-context

tools:
  allow:
    - filesystem.read
    - git.status
    - git.diff
    - git.log
  deny:
    - shell.write
    - git.commit
    - git.push
    - deploy

mcp_servers:
  allow:
    - filesystem-readonly
    - git-readonly
  deny:
    - github-write
    - deployment
---
```

Body:

```markdown
You are an implementation architect.

Your job is to convert a refined feature brief into a practical technical approach.

Prefer:
- explicit tradeoffs
- phased implementation
- data model clarity
- API boundaries
- testing implications
- migration risks

Avoid:
- open-ended product brainstorming
- low-level coding unless requested
- deployment execution
```

---

### 8.2 Context Pack

A context pack is a reusable bundle of files, tags, memories, decisions, and rules.

Examples:

```text
product
design
engineering
qa
release
active-feature
```

Example:

```yaml
id: engineering
name: Engineering Context
description: Core engineering standards, architecture notes, and technical decisions.

include:
  paths:
    - AGENTS.md
    - .gent/memories/engineering-context.md
    - .gent/decisions/engineering/**/*.md
    - docs/architecture/**/*.md

exclude:
  paths:
    - .gent/memories/product-context.md
    - docs/marketing/**

tags:
  include:
    - engineering
    - architecture
    - implementation
  exclude:
    - brainstorming
    - marketing
```

---

### 8.3 Skill

A skill is a reusable instruction package.

Example:

```text
.gent/skills/tech-approach/SKILL.md
```

Skill structure:

```text
.gent/skills/
  tech-approach/
    SKILL.md
    examples/
    templates/
    scripts/
```

Skills should be loadable by profile and optionally exportable to other agent formats.

---

### 8.4 Memory

Memory should be visible, scoped, and editable.

Recommended memory files:

```text
.gent/memories/
  product-context.md
  design-context.md
  engineering-context.md
  qa-context.md
  active-context.md
```

Memory types:

| Type | Purpose |
|---|---|
| Working memory | Current task/session notes |
| Project memory | Stable project facts and conventions |
| Decision memory | Durable decisions and rationale |
| Retrieval memory | Searchable history, run summaries, prior notes |

Gent should not silently mutate memories unless writeback is enabled for the profile.

---

### 8.5 Decision

A decision is a durable record of why something was chosen.

Example:

```text
.gent/decisions/2026-07-01-use-sqlite-sidecar.md
```

Template:

```markdown
# Decision: Use SQLite as compiled context cache

Date: 2026-07-01

## Status

Accepted

## Context

Gent needs fast local context lookup without making a hosted service required.

## Decision

Use markdown/YAML files as the source of truth and SQLite as a compiled local cache.

## Alternatives Considered

- Markdown only
- SQLite as source of truth
- DuckDB
- Hosted vector database
- Local CRDT store

## Consequences

- Users can inspect and commit source files.
- Runtime lookups are fast.
- Cache can be regenerated.
- Multi-user write conflicts are handled at the file/git layer for v1.
```

---

### 8.6 Pipeline

A pipeline is an ordered workflow of profiles.

Example:

```yaml
id: feature-development
name: Feature Development

steps:
  - id: product-brief
    profile: product
    output: feature-brief.md

  - id: uiux-flow
    profile: uiux
    input: feature-brief.md
    output: uiux-flow.md

  - id: tech-approach
    profile: architect
    input: uiux-flow.md
    output: tech-approach.md

  - id: qa-plan
    profile: qa
    input: tech-approach.md
    output: qa-plan.md
```

---

## 9. User Experience

## 9.1 CLI UX

### Basic commands

```bash
gent init
gent sync
gent list
gent inspect <profile>
gent preview <profile> [input]
gent run <profile> [input]
gent pipeline <pipeline> [input]
gent export <target>
```

### Profile shortcuts

Users should be able to run:

```bash
gent product
gent uiux
gent architect
gent coder
gent debugger
gent qa
```

These are aliases for:

```bash
gent run product
gent run uiux
gent run architect
gent run coder
gent run debugger
gent run qa
```

---

### `gent init`

Creates initial `.gent/` structure.

```bash
gent init
```

Output:

```text
Created .gent/
Created default profiles:
- product
- uiux
- architect
- coder
- debugger
- qa

Created default context packs:
- product
- design
- engineering
- qa
- active-feature
```

---

### `gent inspect`

Shows profile configuration.

```bash
gent inspect architect
```

Output:

```text
Profile: architect
Purpose: Create technical approaches for refined features.

Context packs:
  included:
    - engineering
    - architecture
    - active-feature
  excluded:
    - product-brainstorming
    - marketing

Skills:
  included:
    - tech-approach
    - api-design
    - data-modeling
    - testing-strategy

Tools:
  allowed:
    - filesystem.read
    - git.status
    - git.diff
    - git.log
  blocked:
    - git.commit
    - git.push
    - deploy
```

---

### `gent preview`

Shows the actual context bundle before running.

```bash
gent preview architect ./plans/calendar-sync.md
```

Output:

```text
Profile: architect
Input: ./plans/calendar-sync.md

Included:
- .gent/profiles/architect.md
- AGENTS.md
- .gent/context-packs/engineering.yaml
- .gent/memories/engineering-context.md
- .gent/decisions/2026-06-20-api-versioning.md
- .gent/skills/tech-approach/SKILL.md

Excluded:
- .gent/memories/product-context.md
- .gent/skills/product-discovery/SKILL.md
- .gent/skills/debugging/SKILL.md

Enabled MCP:
- filesystem-readonly
- git-readonly

Disabled MCP:
- github-write
- deploy

Estimated tokens: 8,400
```

---

### `gent sync`

Compiles source files into SQLite.

```bash
gent sync
```

Responsibilities:

- Parse `.gent/` files
- Parse `AGENTS.md`, if present
- Parse compatible external rule files, if configured
- Extract frontmatter
- Hash files
- Update SQLite records
- Update FTS index
- Detect stale/deleted files
- Report warnings

---

### `gent run`

Runs a profile with deterministic context.

```bash
gent run architect ./plans/calendar-sync.md
```

In v1, `gent run` may either:

1. Print the compiled prompt/context bundle to stdout.
2. Invoke a configured provider/agent.
3. Export a launch command for external tools.

The simplest v1 behavior should be provider-agnostic:

```bash
gent run architect ./plans/calendar-sync.md --print
```

---

### `gent export`

Exports compatible instructions/configs to other tools.

Examples:

```bash
gent export claude
gent export cursor
gent export codex
gent export roo
gent export cline
```

Possible outputs:

```text
CLAUDE.md
AGENTS.md
.cursor/rules/
.roo/rules/
.clinerules/
```

Export should be best-effort. Gent remains the source profile system.

---

## 9.2 Extension UX

The VS Code/Cursor extension should be named:

```text
Gent UI
```

Sidebar:

```text
Gent
├── Profiles
│   ├── Product Planner
│   ├── UI/UX Refiner
│   ├── Implementation Architect
│   ├── Coder
│   ├── Debugger
│   └── QA Reviewer
│
├── Context Packs
│   ├── Product
│   ├── Design
│   ├── Engineering
│   ├── QA
│   └── Release
│
├── Skills
│   ├── feature-scoping
│   ├── user-story-writing
│   ├── tech-approach
│   ├── debugging
│   └── test-planning
│
├── MCP Servers
├── Memories
├── Decisions
├── Pipelines
└── Runs
```

---

### Profile editor

The profile editor should be a visual form over the profile file.

Sections:

- Name
- Description
- When to use
- Included context packs
- Excluded context packs
- Included skills
- Excluded skills
- Memory scopes
- Allowed tools
- Blocked tools
- Allowed MCP servers
- Output format
- Writeback behavior

Example visual state:

```text
Profile: Product Planner

Purpose:
  Refine feature ideas before engineering planning.

Includes:
  [x] Product context
  [x] Roadmap
  [x] User research
  [x] Product decisions
  [x] Feature scoping skill
  [x] User story skill

Excludes:
  [x] Debugging context
  [x] QA automation
  [x] Deployment
  [x] Git write access
  [x] Shell access
```

---

### Context preview screen

This is one of the most important screens.

It should show:

- What will be included
- What will be excluded
- Why each item was included
- Token estimate
- Warnings
- Permission boundaries
- MCP/tool availability
- Final assembled prompt/context view

Actions:

```text
Preview Context
Run Profile
Copy Context
Export Bundle
Open Source File
```

---

### Pipeline builder

The extension should allow users to visually compose workflows.

Example:

```text
[Product Planner] → [UI/UX Refiner] → [Implementation Architect] → [QA Reviewer]
```

Each node should show:

- Input artifact
- Output artifact
- Profile used
- Context packs used
- Allowed tools
- Writeback behavior

---

### Decision viewer

The decision viewer should show ADR-style records.

Capabilities:

- Create decision
- Link decision to run
- Link decision to profile
- Tag decision
- Search decisions
- Mark decision as proposed, accepted, superseded, or rejected

---

### Memory viewer

The memory viewer should show scoped memory files.

Capabilities:

- View memory by scope
- Edit memory
- See last modified date
- See which profiles use it
- See writeback rules
- Review pending memory updates before accepting

---

### Run history

Each run should produce a local record.

Example:

```text
.gent/runs/2026-07-01T14-30-00-calendar-sync/
  run.json
  input.md
  context-preview.md
  output.md
  decisions.md
  memory-updates.md
```

The extension should show:

- Profile used
- Input
- Output
- Context included
- Tools available
- Tool calls, if Gent controls execution
- Decisions created
- Memory updates proposed/applied

---

## 10. Data Architecture

### Recommended project layout

```text
.gent/
  profiles/
    product.md
    uiux.md
    architect.md
    coder.md
    debugger.md
    qa.md

  context-packs/
    product.yaml
    design.yaml
    engineering.yaml
    qa.yaml
    active-feature.yaml

  skills/
    feature-scoping/
      SKILL.md
    user-story-writing/
      SKILL.md
    tech-approach/
      SKILL.md
    debugging/
      SKILL.md
    test-planning/
      SKILL.md

  memories/
    product-context.md
    design-context.md
    engineering-context.md
    qa-context.md
    active-context.md

  decisions/
    2026-07-01-use-sqlite-sidecar.md

  pipelines/
    feature-development.yaml

  runs/
    2026-07-01T14-30-00-calendar-sync/
      run.json
      context-preview.md
      output.md

  cache/
    gent.sqlite
```

---

## 11. SQLite Cache

The SQLite cache should be generated from source files.

Possible tables:

```sql
documents
document_chunks
profiles
context_packs
skills
memories
decisions
pipelines
runs
run_context_items
tags
document_tags
fts_documents
```

### `documents`

Stores parsed source files.

Fields:

```text
id
path
type
title
content
frontmatter_json
hash
created_at
updated_at
indexed_at
```

### `profiles`

Stores compiled profile metadata.

Fields:

```text
id
name
description
stage
path
config_json
hash
updated_at
```

### `context_packs`

Stores compiled context pack metadata.

Fields:

```text
id
name
description
path
include_json
exclude_json
hash
updated_at
```

### `skills`

Stores discovered skill packages.

Fields:

```text
id
name
description
path
skill_md_path
metadata_json
hash
updated_at
```

### `decisions`

Stores decision metadata.

Fields:

```text
id
title
status
date
path
tags_json
summary
hash
updated_at
```

### `runs`

Stores run metadata.

Fields:

```text
id
profile_id
input_path
output_path
started_at
completed_at
status
context_hash
metadata_json
```

The cache should be safe to delete and regenerate.

---

## 12. Context Assembly Algorithm

Given:

```bash
gent preview architect ./plans/calendar-sync.md
```

Gent should:

1. Load project config.
2. Resolve profile `architect`.
3. Validate profile exists.
4. Load profile frontmatter and body.
5. Load explicit input file.
6. Resolve profile context packs.
7. Apply include rules.
8. Apply exclude rules.
9. Resolve skill includes.
10. Resolve skill excludes.
11. Resolve memory scopes.
12. Resolve relevant decisions.
13. Apply task-stage boundaries.
14. Apply tool/MCP allowlists.
15. Optionally perform scoped FTS/semantic retrieval.
16. Sort context deterministically.
17. Compute context hash.
18. Estimate tokens.
19. Produce preview.

Deterministic sort order:

```text
1. System/base instructions
2. Profile body
3. Project instructions
4. Input file
5. Active context
6. Context pack files
7. Decisions
8. Memories
9. Skills
10. Retrieved snippets
11. Tool/MCP manifest
```

---

## 13. Permissions Model

Profiles should define hard capability boundaries.

Permission categories:

```text
filesystem.read
filesystem.write
shell.read
shell.write
git.status
git.diff
git.log
git.branch
git.commit
git.push
github.read
github.write
browser.read
browser.write
deploy
secrets.read
database.read
database.write
```

Default should be least privilege.

Example:

| Profile | Write files | Run shell | Git write | Deploy |
|---|---:|---:|---:|---:|
| Product | No | No | No | No |
| UI/UX | Optional | No | No | No |
| Architect | No | No | No | No |
| Coder | Yes | Optional | Optional | No |
| Debugger | Optional | Yes | No | No |
| QA | Optional | Yes | No | No |
| Release | Optional | Yes | Optional | Optional |

---

## 14. MCP Strategy

Gent should treat MCP servers as capabilities attached to profiles.

Example:

```yaml
mcp_servers:
  filesystem-readonly:
    command: gent-mcp-filesystem
    permissions:
      - filesystem.read

  git-readonly:
    command: gent-mcp-git
    permissions:
      - git.status
      - git.diff
      - git.log

  github-write:
    command: gent-mcp-github
    permissions:
      - github.write
```

Profiles should explicitly allow or deny MCP servers.

Gent UI should show MCP servers as toggles with warnings.

---

## 15. Export Strategy

Gent should be able to export profile/context data into formats that other tools can consume.

Potential targets:

```bash
gent export agents-md
gent export claude
gent export cursor
gent export codex
gent export cline
gent export roo
```

Export examples:

```text
AGENTS.md
CLAUDE.md
.cursor/rules/
.clinerules/
.roo/rules/
```

Export should be generated and marked as such:

```markdown
<!-- Generated by gent. Edit .gent/ source files instead. -->
```

---

## 16. MVP Scope

### MVP CLI

Required:

- `gent init`
- `gent sync`
- `gent list`
- `gent inspect <profile>`
- `gent preview <profile> [input]`
- Basic `.gent/` schema
- Markdown/YAML parser
- SQLite cache
- FTS search
- Default profiles
- Default context packs
- Default skill structure
- Deterministic context assembly
- Context hash generation

Optional for MVP:

- `gent run`
- `gent export`
- Pipeline execution
- Semantic retrieval
- MCP launcher

---

### MVP Extension

Required:

- Detect `.gent/` project
- Sidebar tree
- Read profiles
- Read context packs
- Read skills
- Read memories
- Read decisions
- Open source files
- Run `gent inspect`
- Run `gent preview`
- Show context preview in webview

Optional for MVP:

- Visual profile editing
- Visual context pack editing
- Pipeline builder
- Run history viewer
- MCP manager
- Memory writeback review

---

## 17. Suggested Development Phases

### Phase 1: File schema + CLI preview

Build the core runtime first.

Deliverables:

- `.gent/` schema
- Default profiles
- Default context packs
- `gent init`
- `gent sync`
- `gent inspect`
- `gent preview`
- SQLite cache
- Context hash

Success criteria:

- User can define a profile in files.
- User can preview exactly what context is included.
- Output is deterministic across runs.

---

### Phase 2: VS Code/Cursor extension read-only Studio

Build the visual layer without editing yet.

Deliverables:

- Sidebar tree
- Profile viewer
- Context pack viewer
- Skill viewer
- Memory viewer
- Decision viewer
- Preview context command
- Open generated context preview

Success criteria:

- User can understand their agent setup visually.
- User can inspect a profile without reading YAML manually.

---

### Phase 3: Visual profile editor

Add editing.

Deliverables:

- Toggle context packs
- Toggle skills
- Toggle MCP/tool permissions
- Edit profile description
- Edit when-to-use guidance
- Save back to `.gent/profiles/*.md`
- Validate config

Success criteria:

- User can create and modify profiles visually.
- Generated files remain readable and git-friendly.

---

### Phase 4: Pipelines and run artifacts

Add multi-step workflow support.

Deliverables:

- Pipeline schema
- Pipeline builder
- `gent pipeline`
- Run directories
- Artifact generation
- Run history view

Success criteria:

- User can run Product → UI/UX → Architect → QA workflows.
- Each step produces durable markdown artifacts.

---

### Phase 5: Export and interoperability

Add compatibility with other agent tools.

Deliverables:

- Export to `AGENTS.md`
- Export to `CLAUDE.md`
- Export to Cursor rules
- Export to Cline/Roo rules where feasible
- Export report showing what was generated

Success criteria:

- User can keep Gent as the source of truth while still using other agents.

---

### Phase 6: Memory writeback and review

Add controlled memory updates.

Deliverables:

- Proposed memory updates
- Review before applying
- Memory scopes
- Memory diff viewer
- Decision creation from run output

Success criteria:

- Agents can help maintain memory without hidden mutation.
- User remains in control.

---

## 18. Success Metrics

### CLI success metrics

- Time to create first profile: under 5 minutes.
- Time to preview context: under 1 second for small projects.
- Context preview reproducible across machines.
- `gent sync` is fast enough to run after pull or checkout.
- Generated context hash stable when source files do not change.

### UX success metrics

- User can tell what context a profile receives without opening YAML.
- User can safely exclude irrelevant skills/context.
- User can create a new profile visually.
- User can understand why an item was included or excluded.
- User trusts `gent preview` before running agents.

### Product success metrics

- User runs multiple specialized profiles instead of one generic agent.
- User commits `.gent/` files to projects.
- User uses `gent inspect` and `gent preview` regularly.
- User creates decisions and run artifacts that become future context.
- User exports to at least one external agent tool.

---

## 19. Risks

### Risk: Too much configuration

Mitigation:

- Ship strong defaults.
- Provide templates.
- Let users start with six profiles.
- Make the extension visual.
- Keep CLI commands simple.

---

### Risk: Context system becomes another messy memory bank

Mitigation:

- Keep profiles explicit.
- Keep memory scoped.
- Require preview.
- Avoid hidden writes.
- Separate decisions, memories, skills, and runs.

---

### Risk: SQLite cache conflicts in git

Mitigation:

- Treat SQLite as generated by default.
- Add `.gent/cache/` to `.gitignore`.
- Allow opt-in committed cache for teams that want it.
- Provide `gent sync` after pull/checkout.

---

### Risk: Exports drift from Gent source

Mitigation:

- Mark exported files as generated.
- Add `gent export --check`.
- Add `gent doctor`.
- Prefer `.gent/` as source of truth.

---

### Risk: Profiles do not actually enforce boundaries

Mitigation:

- Make tool/MCP permissions explicit.
- Apply denies after includes.
- Refuse unsafe runs unless user overrides.
- Show blocked tools in preview.
- Treat instructions as context, but permissions as runtime policy.

---

## 20. Open Questions

1. Should `gent run` directly call LLM providers in v1, or only produce context bundles?
2. Should SQLite cache ever be committed by default?
3. Should semantic embeddings be included in v1, or should FTS be enough initially?
4. Should profiles be markdown with YAML frontmatter, pure YAML, or both?
5. Should Gent provide its own MCP servers, or only manage external MCP configs?
6. Should the VS Code/Cursor extension shell out to `gent`, or share a library with the CLI?
7. Should run artifacts be committed to git by default?
8. Should memory writeback be disabled by default?
9. Should pipeline steps run automatically or require approval between steps?
10. Should `gent` support branch-specific memory by default?

---

## 21. Recommended Defaults

### Default profiles

```text
product
uiux
architect
coder
debugger
qa
reviewer
release
```

### Default context packs

```text
product
design
engineering
qa
release
active-feature
```

### Default memory files

```text
product-context.md
design-context.md
engineering-context.md
qa-context.md
active-context.md
```

### Default commands

```bash
gent init
gent sync
gent inspect <profile>
gent preview <profile> [input]
gent run <profile> [input]
```

### Default storage

```text
Source of truth:
  .gent/**/*.md
  .gent/**/*.yaml

Generated cache:
  .gent/cache/gent.sqlite
```

### Default git behavior

Commit:

```text
.gent/profiles/
.gent/context-packs/
.gent/skills/
.gent/memories/
.gent/decisions/
.gent/pipelines/
```

Ignore:

```text
.gent/cache/
.gent/runs/
```

Optionally commit selected run artifacts and decisions.

---

## 22. V1 Product Promise

Gent v1 should not promise fully autonomous agent orchestration.

Gent v1 should promise:

> A deterministic way to define, preview, and run task-specific agent profiles with the right context, skills, memories, decisions, and tools.

The core user experience should be:

```bash
gent init
gent inspect architect
gent preview architect ./feature.md
gent run architect ./feature.md
```

And in the extension:

```text
Open Gent UI
→ Select Implementation Architect
→ Toggle context packs and skills
→ Preview context
→ Run from CLI or copy/export context
```

---

## 23. Final Recommendation

Build the CLI engine first, but design it as if the Studio already exists.

The correct architecture is:

```text
Gent UI
  Visual VS Code/Cursor extension

gent CLI
  Runtime, compiler, previewer, exporter

.gent/
  Plain files as source of truth

gent.sqlite
  Local compiled cache
```

This keeps the system:

- Human-readable
- Git-friendly
- Local-first
- Fast
- Deterministic
- Portable
- Inspectable
- Compatible with other agent tools

The product should feel simple:

```bash
gent product
gent architect
gent coder
gent debugger
gent qa
```

But under the hood, each profile should have precise context, memory, skill, and tool boundaries.