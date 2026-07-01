# Design: Sandboxes (Slice 1 — Core Model, Local Driver, Apple Container Driver)

**Status:** Approved
**Source PRD:** `docs/sandboxes.prd.md`

## Scope

The PRD describes a broad feature: four runtime drivers (local, Apple Container,
Podman, Docker), a full CLI surface, an extension UI, a security model, and a
roadmap of future drivers. This design covers only the first slice:

- The core sandbox model (definition format, resolution, driver interface).
- CLI verbs for managing sandbox definitions and their lifecycle.
- Two drivers: `local` (no isolation, passthrough) and `apple-container`
  (Apple's `container` runtime, per-container microVM isolation).
- Transparent integration with the existing `gent <profile>` launch path.

Explicitly deferred to future specs: Podman driver, Docker driver, the
extension/UI described in PRD §10–11, resource limits (cpu/memory/disk/
timeout), network allow/deny lists, filesystem modes beyond read-only/
read-write, sandbox `extends`, and multi-sandbox merging for composed
profiles.

## Architecture

```
Profile ──references──> Sandbox ──implemented by──> Driver (local | apple-container)
```

- **Sandbox definition**: a version-controlled YAML file describing where and
  how an agent runs (driver, image, mounts, environment, network, lifecycle).
- **Driver interface**: a small TypeScript interface implemented by both
  `local` and `apple-container`, mirroring how `AgentAdapter` already
  abstracts claude/pi/codex in `src/agents.ts`. Future Podman/Docker drivers
  slot into the same interface without touching CLI or profile code.
- **Runner integration**: `gent <profile>` (`src/runner.ts`) checks
  `profile.sandbox`. If set, it resolves the sandbox, has the driver ensure
  it's running, and executes the agent binary+args through the driver's
  `exec` instead of spawning locally. `--no-sandbox` forces the existing
  local-spawn path.

## Sandbox Definition & Directory Structure

Sandboxes live in `.gent/sandboxes/<id>.yaml`, matching the profiles pattern:
filename is the authoritative id, resolved via the same local-then-parent
`.gent` chain walk already used for profiles (`gentDirChain()` /
`resolveProfilePath`-style lookup — a new `resolveSandboxPath(id)` follows
identical logic).

```yaml
# .gent/sandboxes/dev.yaml
name: Development Sandbox
driver: local              # local | apple-container
image: ghcr.io/org/gent-agent:latest   # required for apple-container, ignored for local
workdir: /workspace                    # container-side path (or host path for local)
lifecycle: ephemeral                   # ephemeral (default) | persistent
mounts:
  - source: ~/Projects/app
    target: /workspace
    mode: rw                           # ro | rw
  - source: ~/.config/gent/context
    target: /gent/context
    mode: ro
environment:
  GENT_PROFILE: coding
network: full                          # none | full (default: full)
```

`extends` is **not** supported on sandboxes in this slice — sandboxes are
simple enough not to need it yet, and it can be added later if requested.

**Profile linkage**: a new optional `sandbox?: string` field on `Profile`
(`src/profiles.ts`) — a name reference, resolved lazily by the runner rather
than at profile-load time, so inspecting a profile never fails due to a
missing sandbox.

## Driver Interface

```ts
// src/sandboxes/driver.ts
export interface SandboxDriver {
  name: "local" | "apple-container";

  /** Validate config against this driver's requirements (mounts exist,
   * runtime on PATH, image resolvable). Returns a list of problems; empty
   * means valid. */
  validate(sandbox: Sandbox): Promise<string[]>;

  /** Ensure the sandbox is up and ready to accept exec. For ephemeral,
   * this is a no-op (the run happens at exec time); for persistent, starts
   * it if not already running. */
  ensureRunning(sandbox: Sandbox): Promise<void>;

  /** Run a command inside the sandbox, inheriting stdio. This is how the
   * agent binary itself gets launched. Returns the child's exit code. */
  exec(sandbox: Sandbox, command: string, args: string[]): Promise<number>;

  /** Tear down. For ephemeral this is a no-op (cleanup already happened);
   * for persistent it's explicit via `gent sandbox <name> stop/destroy`. */
  stop(sandbox: Sandbox): Promise<void>;
  destroy(sandbox: Sandbox): Promise<void>;

  /** Stream/print logs. The local driver reports "not supported" — there's
   * no separate process to capture. */
  logs(sandbox: Sandbox): Promise<void>;
}
```

## Local Driver

`src/sandboxes/drivers/local.ts` — no real isolation; makes the abstraction
uniform for the common case, and behaves identically to today's gent when a
profile has no sandbox at all.

- `validate`: checks mount `source` paths exist on the host.
- `ensureRunning`: no-op.
- `exec`: `spawnSync(command, args, { cwd: workdir, env: {...process.env,
  ...sandbox.environment}, stdio: "inherit" })`. Mounts are informational only
  (no bind semantics on the host itself); `workdir` becomes the actual `cwd`.
- `stop` / `destroy`: no-op.
- `logs`: prints a message that logs aren't applicable to the local driver.

The local driver inherits `process.env` — since it provides no isolation
anyway, hiding host env from it would be theater, not security.

## Apple Container Driver

Wraps Apple's `container` CLI (`github.com/apple/container` — Docker-like
syntax, per-container microVM isolation). Container naming: `gent-<sandbox-id>`
to avoid collisions with unrelated containers.

**The tmp-file trick**: `runner.ts` already writes sensitive profile data
(MCP config, settings, system-prompt, aggregated skills plugin) to a 0600
host tmp dir and passes those paths as CLI args to the agent binary. Rather
than translating paths, the Apple Container driver bind-mounts that *same
host tmp dir at the identical path* inside the container
(`-v <tmpDir>:<tmpDir>:ro`). The args `buildArgs()` already produced work
unmodified inside the container — no path-rewriting logic needed anywhere.

**Lifecycle-dependent behavior:**

| | ephemeral | persistent |
|---|---|---|
| `ensureRunning` | no-op | if `container list` shows `gent-<id>` not running, start detached: `container run --detach --name gent-<id> -v ... -w <workdir> -e ... <image> sleep infinity` |
| `exec` | `container run --rm -v ... -w <workdir> -e ... <image> <cmd> <args>` (foreground, inherits stdio, propagates exit code) | `container exec gent-<id> <cmd> <args>` |
| `stop` | no-op (already gone) | `container stop gent-<id>` |
| `destroy` | no-op | `container stop gent-<id>` (if running) then `container rm gent-<id>` |
| `logs` | prints "not applicable — ephemeral container already exited" | `container logs gent-<id>` |

Mounts: sandbox-defined `mounts` map to `-v source:target[:ro]` flags, plus
the tmp-dir mount described above appended automatically. `environment` maps
to `-e KEY=value` flags — and unlike the local driver, this is the *only*
environment passed into the container (not `process.env`), since here
isolation is actually meaningful.

`validate`: checks the `container` binary is on `PATH` (else error with an
install hint, same pattern as `AgentAdapter.installHint`), checks each mount
`source` exists on the host, and checks the image is present locally via
`container images inspect <image>` (reports missing rather than auto-pulling
— pulling happens lazily in `ensureRunning`/`exec` the first time, same as
`docker run` would).

## CLI

CRUD matches the existing profile/mcp verbs exactly; lifecycle actions
become a `gent sandbox <name> <action>` subgroup, since nothing else in gent
has runtime lifecycle verbs:

```
gent create sandbox [name]            # interactive wizard (driver, image, mounts, network, lifecycle)
gent create sandbox local              # from built-in template
gent create sandbox apple-container    # from built-in template
gent list sandbox                      # list all sandboxes (local + inherited, same tagging as `gent list mcp`)
gent show sandbox <name>               # print resolved YAML
gent update sandbox <name>             # edit interactively
gent delete sandbox <name>             # remove definition only (see Validation & Error Handling)

gent sandbox <name> validate           # run driver.validate(), print problems or "OK"
gent sandbox <name> run                # driver.ensureRunning() directly (mostly useful for persistent)
gent sandbox <name> exec -- <cmd>      # driver.ensureRunning() + driver.exec(cmd, args)
gent sandbox <name> logs               # driver.logs()
gent sandbox <name> stop               # driver.stop()
gent sandbox <name> destroy            # driver.destroy()
```

`gent list sandbox` reuses the existing inherited-tagging convention from
`gent list mcp` (`(inherited)` suffix when sourced from a parent `.gent` dir).

## Profile/Runner Integration

`src/runner.ts` gains a sandbox-aware branch:

```ts
export async function run(profile: Profile, extraArgs: string[], dryRun: boolean, noSandbox: boolean): Promise<void> {
  const adapter = getAdapter(profile.agent);
  const globalConfig = loadConfig();

  if (profile.sandbox && !noSandbox && !dryRun) {
    const sandbox = loadSandbox(profile.sandbox);
    const driver = getDriver(sandbox.driver);
    // ...write tmp files as today, then:
    await driver.ensureRunning(sandbox);
    const args = adapter.buildArgs(profile, globalConfig, tmpDir);
    const code = await driver.exec(sandbox, adapter.binary, [...args, ...extraArgs]);
    if (sandbox.lifecycle === "ephemeral") await driver.destroy(sandbox);
    process.exit(code);
  }
  // ...existing local spawnSync path unchanged (also used for dry-run and --no-sandbox)
}
```

- `--no-sandbox` is a new flag on the bare `gent <profile>` launch command,
  forcing the pre-existing local path even if `profile.sandbox` is set.
- `--dry-run` never touches a driver — it always shows the plain adapter
  command, echoing which sandbox *would* be used, so the preview stays
  informative without side effects.
- If `profile.sandbox` names a sandbox that doesn't exist, this is a
  load-time error (same style as an unresolvable MCP server reference): fail
  with a clear message before spawning anything.
- Composed profiles (`gent dev,qa`) are out of scope for sandbox merging in
  this slice — if more than one composed profile sets `sandbox`, the
  rightmost wins (same precedent as `agent` in `mergeProfiles`), covered by
  a test rather than left to silently surprise someone.

## Validation & Error Handling

- **Sandbox name validation**: reuse the same `VALID_NAME` pattern as
  profiles (`profiles.ts`), applied to sandbox ids.
- **Unknown driver**: `driver: <typo>` in a sandbox YAML fails at
  `getDriver()` lookup with a clear error listing valid drivers (`local`,
  `apple-container`), same style as `isAgentName`/`getAdapter`.
- **Missing sandbox referenced by a profile**: fails before any spawn,
  listing the searched `.gent` chain (mirrors `loadProfile`'s not-found
  error).
- **`container` binary missing**: `validate` and `ensureRunning`/`exec`
  surface the same install hint pattern used by `AgentAdapter.installHint`.
- **Mount source doesn't exist**: reported by `validate` as a warning-level
  problem list entry, not a hard crash at load time — a sandbox can be
  defined before the host path exists (e.g. shared team config).
- **`gent delete sandbox`** only removes the YAML definition; it does not
  stop/destroy a running instance. If a driver reports the sandbox is
  currently running, `delete` prints a warning suggesting
  `gent sandbox <name> destroy` first, but still proceeds — definitions and
  running instances are decoupled by design.
- **Security invariant carried over from the PRD**: nothing about a sandbox
  is implicitly inherited from the host. `environment` in the sandbox YAML
  is the only environment passed into `apple-container` exec calls; the
  local driver is the one exception (see Local Driver above).

## Templates & Testing

**Templates** (two, matching the drivers in this slice — Podman/Docker
templates arrive with those drivers):

- `gent create sandbox local` → no isolation, `workdir` = cwd, `network:
  full`, `lifecycle: ephemeral`.
- `gent create sandbox apple-container` → minimal mounts (project dir rw,
  gent context ro), `network: none`, `lifecycle: ephemeral` — the PRD's
  "Secure Agent" preset.

**Testing** (unit-level, no real container runtime in CI — matches the
existing pattern in `runner.test.ts` of testing pure functions rather than
spawning real processes):

- Sandbox YAML parsing/resolution (`loadSandbox`, chain walking, name
  validation) — mirrors `profiles.test.ts`.
- `local` driver: extract a pure `buildLocalExecOptions()`-style helper for
  the env/cwd composition and test it directly, without spawning.
- `apple-container` driver: extract pure "build the container CLI args"
  functions for each lifecycle mode (`run`/`exec`/`stop`/`rm`) and assert on
  their output; never invoke `spawnSync` for real. Mock `PATH` lookup /
  `container images inspect` output for `validate`.
- Runner integration: test the dispatch branch (driver vs. existing
  local-spawn path) with a fake `SandboxDriver` implementation,
  dependency-injected the same way adapter tests work today.
- CLI wiring: smoke-test command registration (commander structure), the
  way `add.ts`/`create.ts` tests likely already do.
