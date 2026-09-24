# Changelog

## 0.1.1 - 2026-09-24

### Changed

- Refresh the toolchain to Bun 1.4.2: CI now installs with `bun install --frozen-lockfile`, runs `bun run check` / `bun run test`, and keeps an `npm ci` consumer job.
- Pin exact devDependencies: `@biomejs/biome` 2.5.14, `vitest` 5.0.1, `@vitest/coverage-v8` 5.0.1, `typescript` 7.0.2, `@types/node` 26.6.2, `@typescript/native-preview` 7.0.0-dev.20260707.2, `tsx` 4.23.15.
- Add `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` as exact `0.87.1` devDependencies so tests typecheck against the current upstream runtime. Peer ranges stay `*` so date-versioned hosts (senpi) still resolve.
- CI matrix: `ubuntu-latest` / `macos-latest` × Node 22 / 24, `actions/checkout@v7`, `actions/setup-node@v7`, `oven-sh/setup-bun@v2` with Bun 1.4.2.
- `engines.node` remains `>=22.19.0`.

### Tests

- Replace the root-sensitive `chmod 000` AGENTS.md fixture with a deterministic `EISDIR` directory read (thanks [@madgegja](https://github.com/madgegja)).

### Fixed

- Closes the dependency/CI refresh tracked in #33.

### Notes

- Dependabot PRs #18, #24, #26, #27, #29, #30, #32 and contributor PR #31 (`^0.83.0` peers) are superseded by this release.
