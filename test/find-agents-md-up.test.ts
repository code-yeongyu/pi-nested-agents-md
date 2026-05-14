import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findAgentsMdUp } from "../src/core/find-agents-md-up.js";
import { createTestTree, type TestTree } from "./fixtures/create-tree.js";

describe("findAgentsMdUp", () => {
	it("returns nested AGENTS.md outermost-first and excludes the project root file", async () => {
		// given
		const tree: TestTree = await createTestTree({
			"AGENTS.md": "# root rules\nroot directives",
			"src/AGENTS.md": "# src rules\nsrc directives",
			"src/components/AGENTS.md": "# components rules\ncomponents directives",
			"src/components/Button.tsx": "export const Button = () => null;",
		});
		try {
			// when
			const found = await findAgentsMdUp({
				startDir: tree.path("src/components"),
				rootDir: tree.root,
			});

			// then
			expect(found).toEqual([tree.path("src/AGENTS.md"), tree.path("src/components/AGENTS.md")]);
		} finally {
			await tree.cleanup();
		}
	});

	it("ignores CLAUDE.md when default file names list is used", async () => {
		// given
		const tree = await createTestTree({
			"src/AGENTS.md": "# src AGENTS",
			"src/CLAUDE.md": "# src CLAUDE (should be ignored under default config)",
			"src/file.ts": "export const x = 1;",
		});
		try {
			// when
			const found = await findAgentsMdUp({ startDir: tree.path("src"), rootDir: tree.root });

			// then
			expect(found).toEqual([tree.path("src/AGENTS.md")]);
		} finally {
			await tree.cleanup();
		}
	});

	it("returns empty array when only the root has AGENTS.md", async () => {
		// given
		const tree = await createTestTree({
			"AGENTS.md": "# root only",
			"src/file.ts": "export const x = 1;",
		});
		try {
			// when
			const found = await findAgentsMdUp({ startDir: tree.path("src"), rootDir: tree.root });

			// then
			expect(found).toEqual([]);
		} finally {
			await tree.cleanup();
		}
	});

	it("does NOT find AGENTS.md inside child directories of the start directory (no down-scan)", async () => {
		// given
		const tree = await createTestTree({
			"src/file.ts": "export const x = 1;",
			"src/components/AGENTS.md": "# child agents",
		});
		try {
			// when
			const found = await findAgentsMdUp({ startDir: tree.path("src"), rootDir: tree.root });

			// then
			expect(found).toEqual([]);
		} finally {
			await tree.cleanup();
		}
	});

	it("returns empty array when no AGENTS.md exists anywhere", async () => {
		// given
		const tree = await createTestTree({ "src/components/Button.tsx": "x" });
		try {
			// when
			const found = await findAgentsMdUp({
				startDir: tree.path("src/components"),
				rootDir: tree.root,
			});

			// then
			expect(found).toEqual([]);
		} finally {
			await tree.cleanup();
		}
	});

	it("returns all intermediate AGENTS.md outermost-first across deep nesting", async () => {
		// given
		const tree = await createTestTree({
			"a/AGENTS.md": "# a",
			"a/b/AGENTS.md": "# b",
			"a/b/c/AGENTS.md": "# c",
			"a/b/c/d/AGENTS.md": "# d",
			"a/b/c/d/file.ts": "x",
		});
		try {
			// when
			const found = await findAgentsMdUp({ startDir: tree.path("a/b/c/d"), rootDir: tree.root });

			// then
			expect(found).toEqual([
				tree.path("a/AGENTS.md"),
				tree.path("a/b/AGENTS.md"),
				tree.path("a/b/c/AGENTS.md"),
				tree.path("a/b/c/d/AGENTS.md"),
			]);
		} finally {
			await tree.cleanup();
		}
	});

	it("falls back to CLAUDE.md per directory when both file names are configured and AGENTS.md is missing", async () => {
		// given
		const tree = await createTestTree({
			"src/AGENTS.md": "# src AGENTS",
			"src/components/CLAUDE.md": "# components CLAUDE only",
			"src/components/Button.tsx": "x",
		});
		try {
			// when
			const found = await findAgentsMdUp({
				startDir: tree.path("src/components"),
				rootDir: tree.root,
				fileNames: ["AGENTS.md", "CLAUDE.md"],
			});

			// then
			expect(found).toEqual([tree.path("src/AGENTS.md"), tree.path("src/components/CLAUDE.md")]);
		} finally {
			await tree.cleanup();
		}
	});

	it("prefers AGENTS.md over CLAUDE.md when both are present in the same directory", async () => {
		// given
		const tree = await createTestTree({
			"src/AGENTS.md": "# src AGENTS",
			"src/CLAUDE.md": "# src CLAUDE",
			"src/file.ts": "x",
		});
		try {
			// when
			const found = await findAgentsMdUp({
				startDir: tree.path("src"),
				rootDir: tree.root,
				fileNames: ["AGENTS.md", "CLAUDE.md"],
			});

			// then
			expect(found).toEqual([tree.path("src/AGENTS.md")]);
		} finally {
			await tree.cleanup();
		}
	});

	it("returns empty array when the start directory equals the project root", async () => {
		// given
		const tree = await createTestTree({
			"AGENTS.md": "# root only",
			"file.ts": "x",
		});
		try {
			// when
			const found = await findAgentsMdUp({ startDir: tree.root, rootDir: tree.root });

			// then
			expect(found).toEqual([]);
		} finally {
			await tree.cleanup();
		}
	});

	it("stops at real directory boundary instead of matching a shared path prefix", async () => {
		// given
		const baseDir = await mkdtemp(join(tmpdir(), "nested-agents-boundary-"));
		const rootDir = join(baseDir, "foo");
		const siblingDir = join(baseDir, "foobar");
		const startDir = join(siblingDir, "child");
		await mkdir(rootDir, { recursive: true });
		await mkdir(startDir, { recursive: true });
		await writeFile(join(siblingDir, "AGENTS.md"), "# sibling", "utf-8");
		try {
			// when
			const found = await findAgentsMdUp({ startDir, rootDir });

			// then
			expect(found).toEqual([]);
		} finally {
			await rm(baseDir, { recursive: true, force: true });
		}
	});
});
