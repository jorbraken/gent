# Gent UI VS Code/Cursor Extension Design

Date: 2026-07-01
Status: Approved for implementation planning
Source PRD: `docs/vscode-extension.prd.md`

## Summary

Gent UI is the VS Code/Cursor extension for Gent. It provides a visual, source-aware interface for creating, editing, deleting, inspecting, and previewing Gent project files while preserving Gent's core promise: readable, versionable files remain the source of truth.

The first release includes full CRUD for the entities shown in the sidebar: profiles, context packs, skills, MCP servers, memories, decisions, and pipelines. Runs are shown for inspection; run artifact editing is out of scope for the first release.

## Goals

- Detect and work with the active `.gent/` project configuration.
- Provide a Gent UI sidebar with Profiles, Context Packs, Skills, MCP Servers, Memories, Decisions, Pipelines, and Runs.
- Support create, edit, and delete for all editable entity types.
- Use source-aware split editing so users can understand how visual edits map to files.
- Preserve readable, git-friendly source files.
- Use a shared TypeScript core for parsing, validation, templates, diagnostics, and serialization.
- Shell out to `gent inspect` and `gent preview` for runtime-oriented operations.
- Fail safely when files contain unsupported custom structures or invalid content.

## Non-Goals

- Replacing the `gent` CLI runtime.
- Editing run artifacts in the first release.
- Running autonomous pipelines inside the extension.
- Hiding file changes behind an opaque database or extension-only state.
- Silently normalizing custom source files without user approval.

## Architecture

Gent UI should be a VS Code/Cursor extension package in this repo, backed by a shared TypeScript core. The core owns `.gent/` discovery, entity parsing, schema validation, safe serialization, file operations, canonical templates, and diagnostics. The CLI should consume the same core where practical so CLI behavior and extension behavior stay aligned.

The extension uses VS Code APIs for tree views, commands, custom editors or webviews, file watching, diagnostics, workspace edits, and confirmation flows. It shells out to `gent inspect`, `gent preview`, and future runtime commands when the desired behavior is execution-oriented rather than local editing.

This split keeps Gent UI faithful to CLI semantics while enabling responsive visual editing and live validation.

## User Interface Model

The primary editing experience is a source-aware split editor:

- The source side shows the backing markdown, YAML, or related file content, or provides a source preview/open action where native VS Code editing is more appropriate.
- The visual side shows structured fields for the selected entity.
- Users can always open or reveal the backing source file.
- Visual saves use shared core serializers.

Sidebar structure:

```text
Gent
├── Profiles
├── Context Packs
├── Skills
├── MCP Servers
├── Memories
├── Decisions
├── Pipelines
└── Runs
```

Selecting an entity opens its split editor. Each editable entity type supports create, edit, and delete. Delete actions require confirmation and should use VS Code trash where available.

If an existing file contains custom structure that cannot safely round-trip through the visual editor, Gent UI asks the user whether to preserve custom source or convert the file to Gent's canonical format. Preserving custom source disables unsafe visual save for the unsupported portion. Converting to canonical format requires explicit confirmation and should show a diff or clear summary.

## Editable Entities

### Profiles

Profiles expose structured fields for role, purpose, when-to-use guidance, included/excluded context packs, included/excluded skills, memory scopes, allowed/blocked tools, allowed/blocked MCP servers, output expectations, and writeback behavior.

### Context Packs

Context packs expose metadata, include path rules, exclude path rules, included/excluded tags, and referenced memories or decisions when those fields exist in the Gent schema.

### Skills

Skills are folder-backed packages. Gent UI should support creating and deleting skill folders, editing `SKILL.md`, and managing common supporting files where the schema recognizes them. Arbitrary extra files should be preserved.

### MCP Servers

MCP server editing should expose server name, command, args, environment variables, and permission mappings. Profiles reference MCP servers by allow/deny lists.

### Memories

Memory editing is markdown-first with structured metadata where available. The visual side can show scope, usage by profiles, last modified information, and writeback rules.

### Decisions

Decision editing follows ADR-style records with title, date, status, context, decision, alternatives, consequences, tags, and links to profiles or runs when those link fields exist in the Gent schema.

### Pipelines

Pipeline editing exposes ordered steps, profile selection, input artifacts, output artifacts, context expectations, and writeback behavior. A visual step list is required for v1; a graph builder can be added later without changing the data model.

### Runs

Runs are read-only in v1. Gent UI should list runs, show metadata and artifacts, and open generated files.

## Core Components

### Shared Core

Responsibilities:

- Discover active `.gent/` directories and the current config inheritance model.
- Load profiles, context packs, skills, MCP config, memories, decisions, pipelines, and runs.
- Parse YAML, markdown frontmatter, markdown bodies, and folder-backed packages.
- Validate schemas, references, IDs, paths, and duplicate definitions.
- Produce diagnostics with stable codes and source ranges when the parser can map an issue to a file location.
- Provide canonical templates for creation.
- Serialize canonical updates.
- Detect whether a file can safely round-trip through a visual editor.

### VS Code Extension Host

Responsibilities:

- Register commands, tree views, custom editors/webviews, diagnostics, and file watchers.
- Own prompts for create, delete, preserve custom source, and canonicalize decisions.
- Bridge VS Code document lifecycle with shared core operations.
- Execute CLI commands for inspect and preview.

### Entity Tree Provider

Responsibilities:

- Group all Gent entities by type.
- Show validation or warning badges for entities with current diagnostics.
- Support create, open, reveal source, delete, refresh, and preview-related actions.

### Split Visual Editors

Responsibilities:

- Render entity-specific forms using shared editor behavior.
- Show source content or source-open affordances.
- Block unsafe saves.
- Surface diagnostics inline.
- Refresh when watched files change.

### Preview and Inspect Webviews

Responsibilities:

- Run `gent inspect` and `gent preview` in the active workspace.
- Render structured output when available.
- Safely render plain text output when structured output is unavailable.
- Provide actions to copy context, open source files, refresh, and show command details.

### Diagnostics and Watchers

Responsibilities:

- Watch `.gent/**`.
- Revalidate affected entities after changes.
- Update tree items, editors, and diagnostics without requiring window reload.

## Data Flow

### Normal Visual Editing

```text
User opens entity
→ Extension asks shared core to load and parse backing files
→ Core returns structured entity, diagnostics, and round-trip safety status
→ Split editor renders source and visual fields
→ User changes visual fields
→ Core validates proposed entity
→ User saves
→ Core serializes canonical file update
→ Extension writes through VS Code workspace APIs
→ File watcher refreshes tree and diagnostics
```

### Raw Source Changes

```text
User edits raw file
→ VS Code document or file watcher notifies extension
→ Core reparses the file
→ Visual editor refreshes if safe
→ If unsupported custom structure appears, Gent UI prompts:
   preserve custom source, or convert to canonical format
```

### Inspect and Preview

```text
User selects profile and optional input
→ Extension shells out to gent inspect or gent preview
→ Output is rendered in a webview
→ Detected or structured file paths can be opened from the preview
```

### Create

```text
User chooses entity type, ID/name, and template
→ Core validates ID and path uniqueness
→ Core generates source file or folder
→ Extension writes files through VS Code APIs
→ Tree and diagnostics refresh
```

### Delete

```text
User chooses delete
→ Extension shows confirmation with affected file/folder path
→ Extension moves to trash where available, otherwise deletes
→ Tree and diagnostics refresh
```

## Error Handling and Safety

Gent UI should fail safely around user-owned source files.

Show diagnostics and inline warnings for:

- Parse errors.
- Invalid YAML or frontmatter.
- Missing references.
- Duplicate IDs.
- Unsupported custom structures.
- Invalid paths or IDs.
- Failed file operations.
- Failed CLI commands.

Visual save must be blocked when it would silently discard source content. Canonical conversion must require confirmation and should show a diff or summary before applying.

For failed CLI commands, Gent UI should show the command, working directory, exit code, stdout, stderr, and actions to retry, copy details, or open a terminal.

## Testing Strategy

Shared core tests:

- Parse, validate, and serialize every entity type.
- Detect duplicate IDs and missing references.
- Preserve or explicitly flag custom source structures.
- Generate canonical templates.
- Validate round-trip behavior and canonicalization decisions.

Extension tests:

- Populate sidebar trees from mocked or fixture `.gent/` folders.
- Refresh tree and diagnostics after file changes.
- Save visual editor changes through mocked VS Code workspace APIs.
- Block unsafe visual saves.
- Confirm delete/canonicalize flows.
- Handle `gent inspect` and `gent preview` success and failure.

End-to-end smoke tests should run in an extension host if the project setup supports it.

## Implementation Notes

- Prefer a refactor toward a shared core before duplicating schema logic in the extension.
- Keep generated files readable and git-friendly.
- Keep CLI execution separate from local editing concerns.
- Prefer structured CLI output for `inspect` and `preview` when the CLI supports it; fall back to safe text rendering.
- Do not commit `.superpowers/` visual brainstorming artifacts.

## Open Decisions Resolved

- Extension name: Gent UI.
- First release scope: create, edit, and delete for all sidebar entity types except runs, which are read-only.
- Primary editing model: source-aware split editing.
- Unsafe round-trip behavior: ask the user whether to preserve custom source or convert to canonical format.
- CLI integration: shared TypeScript core for parsing and validation; shell out to CLI for inspect, preview, and runtime-oriented operations.
