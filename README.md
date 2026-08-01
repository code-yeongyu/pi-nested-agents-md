# pi-nested-agents-md

[![ci](https://github.com/code-yeongyu/pi-nested-agents-md/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/code-yeongyu/pi-nested-agents-md/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/code-yeongyu/pi-nested-agents-md?style=flat-square)](LICENSE)
[![node](https://img.shields.io/node/v/@code-yeongyu/pi-nested-agents-md?style=flat-square)](package.json)

> **From [omo (oh-my-openagent)](https://github.com/code-yeongyu/oh-my-openagent)** — ported to [pi-mono](https://github.com/earendil-works/pi-mono)'s coding-agent extension API.

A pi-mono coding-agent extension that automatically injects nearby `AGENTS.md` files into the agent's context whenever it reads a file in a nested directory. When the agent reads `src/components/Button.tsx`, this extension finds `src/AGENTS.md` and `src/components/AGENTS.md`, attaches their contents to the read tool result, and the agent gets the surrounding directory's rules without you having to paste them yourself.

The pi coding-agent already loads the project root's `AGENTS.md` (and the chain of ancestor `AGENTS.md` files above the project root) at session start. **This extension fills the missing piece**: nested `AGENTS.md` files inside subdirectories of your project. That mirrors how [omo's `directory-agents-injector`](https://github.com/code-yeongyu/oh-my-openagent/tree/main/src/hooks/directory-agents-injector) injects nested context into opencode.

## Why nested `AGENTS.md`?

Real codebases are layered. Your repo's root `AGENTS.md` describes house rules. `src/AGENTS.md` describes architectural patterns for application code. `src/components/AGENTS.md` describes component-author conventions. `src/api/AGENTS.md` describes route-handler conventions. The agent should pick up the closest rules to the file it is touching, automatically — exactly how a human team member learns the local conventions of the folder they're editing.

## Features

- **Walk-up discovery** — when the agent reads a file, this extension walks from the file's directory up toward the project root, finding `AGENTS.md` files at each ancestor.
- **Skips the root** — pi-mono already loads the root `AGENTS.md` natively; this extension never duplicates it.
- **Outermost-first ordering** — when multiple ancestors have an `AGENTS.md`, they are appended in the order from highest ancestor down to the file's parent, matching how a reader would naturally encounter them.
- **Per-session deduplication** — the same `AGENTS.md` is not appended twice in a session.
- **Cache reset on `session_compact` / `session_shutdown`** — after compaction or session restart, files become eligible for re-injection.
- **Realpath-based root containment** — symlinks that escape the project root are rejected; sibling roots that share a name prefix (`repo` vs `repo-evil`) are correctly distinguished.
- **Code-point-safe truncation** — large `AGENTS.md` files are truncated at a UTF-8 byte boundary that never splits a code point. Defaults: 32 KiB per file, 128 KiB total per read.
- **Tool-result safety** — never mutates non-`read` results; never touches `isError` results; never touches non-text content; preserves all original content blocks as a prefix of the patched content.
- **TUI status line, optional widget, slash command** — see [TUI features](#tui-features).
- **`--no-nested-agents` flag** — fully bypass the extension when you want pi's default behavior only.

## Installation

This extension follows pi-mono's standard discovery and packaging conventions documented in [`pi-mono/packages/coding-agent/docs/extensions.md`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/extensions.md).

### Option 1 — global, auto-discovered

Clone (or `git submodule add`) into pi's global extensions directory:

```bash
mkdir -p ~/.pi/agent/extensions
git clone https://github.com/code-yeongyu/pi-nested-agents-md ~/.pi/agent/extensions/pi-nested-agents-md
cd ~/.pi/agent/extensions/pi-nested-agents-md
npm install --omit=dev
```

`pi` will auto-discover the extension via the `pi.extensions` field in `package.json` and load it for every session in every project.

### Option 2 — project-local

Drop it inside your project's `.pi/extensions/`:

```bash
mkdir -p .pi/extensions
git clone https://github.com/code-yeongyu/pi-nested-agents-md .pi/extensions/pi-nested-agents-md
cd .pi/extensions/pi-nested-agents-md
npm install --omit=dev
```

Project-local extensions only activate when `pi` is launched from this project's working directory.

### Option 3 — explicit `--extension` flag (one-off use)

For trying it out without installing globally:

```bash
pi -e /absolute/path/to/pi-nested-agents-md/src/index.ts
```

### Option 4 — pi package install (npm or git)

If you prefer pi's package manager:

```bash
pi install git:github.com/code-yeongyu/pi-nested-agents-md
```

This adds the extension to pi's `settings.json` `packages` list, and `pi update` keeps it current.

## Usage

Once installed, the extension activates automatically. There is no configuration step.

```bash
# Just run pi normally:
pi
```

Now whenever pi's `read` tool fires inside a directory whose ancestors contain an `AGENTS.md`, the file's contents will be appended to the read result for the agent to see. Pi-mono already loads the root `AGENTS.md` at session start — this extension only adds the nested ones above the file being read.

### Slash command

```
/nested-agents
```

Toggles the optional widget that lists every `AGENTS.md` injected so far this session, with truncation marks. The command also writes a debug entry containing the live cache state via `pi.appendEntry`, so it survives session export.

### CLI flag

```bash
pi --no-nested-agents
```

Disables the extension for the session. No injection, no UI elements. Useful when you want strict default-pi behavior, or for A/B comparing prompt sizes.

## How it works

```
Walk-up discovery (per read tool result):

  /Users/you/repo/                <-- ctx.cwd  (root AGENTS.md handled by pi natively, SKIPPED here)
  ├── AGENTS.md                       (skipped)
  ├── src/
  │   ├── AGENTS.md                <-- ✓ injected (1st)
  │   ├── components/
  │   │   ├── AGENTS.md            <-- ✓ injected (2nd)
  │   │   └── Button.tsx           <-- agent calls read
  │   └── ...
  └── ...
```

For each ancestor directory between the read file's parent and the project root (exclusive), the extension looks for `AGENTS.md`. Each unique directory is injected at most once per session. After a `session_compact` or `session_shutdown`, the cache is cleared so subsequent reads pick the file up again.

The injected text uses the same omo-compatible block format:

```
[Directory Context: /abs/path/AGENTS.md]
<file contents>
```

When a file exceeds the byte cap, a truncation notice is appended:

```
[Note: Content was truncated to save context window space. For full context, please read the file directly: /abs/path/AGENTS.md]
```

## TUI features

| Element | Where | When | Format |
|---|---|---|---|
| Status line | Footer (key `ext:nested-agents:status`) | Updated after every injection | `🤖 N` (dim), with a trailing `⚠️` (warning) when an `AGENTS.md` failed to read |
| Widget | Above editor (key `ext:nested-agents:widget`) | Hidden by default; shown after `/nested-agents` toggle | `Nested Context:` header (accent), one line per file (dim), truncated files highlighted (warning) |
| Notification | Standard | After `/nested-agents` toggle | "Nested AGENTS.md context widget shown/hidden" |
| Debug entry | Session log | After `/nested-agents` runs | Custom entry of type `nested-agents-md:debug` with absolute paths, cache size, truncation flags |

In headless / RPC / `pi -p` print mode (`ctx.hasUI === false`), all UI calls are silently skipped. **Injection still occurs** — the agent gets its nested context regardless of UI presence.

## Defaults

| Knob | Default | Override |
|---|---|---|
| File names searched | `AGENTS.md` only (strict omo parity) | Edit `DEFAULT_FILE_NAMES` in `src/core/types.ts` to add `CLAUDE.md` |
| Max bytes per `AGENTS.md` file | 32 KiB | Pass `config.maxBytesPerFile` when invoking the orchestrator directly |
| Max bytes per read tool result | 128 KiB total budget across all injected files | Pass `config.maxBytesPerRead` |
| Status line key | `ext:nested-agents:status` | Edit `STATUS_KEY` in `src/ui/reporter.ts` |
| Widget key | `ext:nested-agents:widget` | Edit `WIDGET_KEY` in `src/ui/reporter.ts` |
| Slash command | `/nested-agents` | Edit `COMMAND_TOGGLE` in `src/index.ts` |

## Architecture

```
src/
├── index.ts                         # pi adapter — registers hooks, command, flag
├── core/                            # pure modules, no pi imports
│   ├── types.ts                     # shared types + defaults
│   ├── find-agents-md-up.ts         # outermost-first walk-up discovery
│   ├── containment.ts               # realpath-based root containment
│   ├── injection-cache.ts           # per-session dedup
│   ├── truncate.ts                  # code-point-safe UTF-8 byte truncation
│   ├── format.ts                    # omo-exact directory-context block
│   ├── session-key.ts               # session identity for cache scoping
│   └── inject-directory-context.ts  # orchestrator
└── ui/
    └── reporter.ts                  # setStatus, setWidget, theme, hasUI guards
```

The pi adapter (`src/index.ts`) only wires events and pushes results to the UI reporter. All algorithmic decisions (walk, dedup, truncate, format) are pure functions in `src/core/*` testable without the pi runtime.

## Development

```bash
npm install        # installs vitest, typescript, pi types
npm test           # runs vitest --run (62 tests)
npm run check      # tsc --noEmit
npm run test:watch # vitest watch mode
```

The test suite includes:

- **Unit tests** for each pure module (finder, containment, cache, truncate, format).
- **Orchestrator tests** for `injectDirectoryContext` covering happy path, symlink escape, sibling-root prefix bug, dedup, deterministic `EISDIR` read errors, truncation, deep nesting.
- **Tool-result middleware tests** that simulate pi-mono's chained `tool_result` handler model and prove our handler appends to the latest content (not the original event content).
- **Lifecycle integration tests** that drive the full extension via a fake `pi` API harness — proving cache reset on `session_compact`/`session_shutdown`, multi-session isolation, and the original-content-as-prefix invariant.
- **TUI integration tests** asserting status/widget calls under `hasUI=true`/`false`, the `--no-nested-agents` inert mode, slash-command toggle on/off, themed line rendering, the truncation warning line, and the debug entry shape.

Tests use given/when/then comments per the project AGENTS.md convention.

## Relation to omo

This extension is a faithful port of omo's [`directory-agents-injector`](https://github.com/code-yeongyu/oh-my-openagent/tree/main/src/hooks/directory-agents-injector) hook from the opencode runtime to the pi-mono coding-agent runtime. The key design choices preserved from omo:

- Hook on the `read` tool's result event (not on session start), so the agent only spends context on directories it actually visits.
- Walk UP from the read file's directory to the project root.
- Skip the root file because the host runtime already loads it natively (opencode in omo, pi in this port).
- Per-session in-memory cache, cleared on compaction.
- `[Directory Context: <path>]\n<content>` block format, omo-exact.

The pi-mono port adds:

- A pi-native TUI surface (status line, optional widget, slash command, flag) using `ctx.ui.setStatus`, `ctx.ui.setWidget`, `ctx.ui.theme`, `pi.registerCommand`, `pi.registerFlag`, `pi.appendEntry`.
- Realpath-based root containment that defends against symlink escapes and prefix-overlap roots (e.g. `repo` vs `repo-evil`) — issues that omo's lexical `startsWith` check did not address.
- A pure orchestrator decoupled from the pi runtime, so the algorithm is testable without booting pi.

## License

[MIT](LICENSE) © YeonGyu Kim

## Related

- [senpi](https://github.com/code-yeongyu/senpi) — the fork/runtime these extensions are extracted from.
- [Ultraworkers Discord](https://discord.gg/PUwSMR9XNk) — community link from the senpi README.
- [Dori](https://sisyphuslabs.ai) — the product powered by senpi under the hood.

Heavily inspired by, and grateful to, [omo (oh-my-openagent)](https://github.com/code-yeongyu/oh-my-openagent). The pi-mono coding-agent and its extension API are maintained by [Earendil Works](https://github.com/earendil-works) — see [pi-mono](https://github.com/earendil-works/pi-mono).
