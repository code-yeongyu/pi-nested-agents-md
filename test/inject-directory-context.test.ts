import { describe, expect, it } from "vitest";
import { injectDirectoryContext } from "../src/core/inject-directory-context.js";
import { InjectionCache } from "../src/core/injection-cache.js";
import { createTestTree } from "./fixtures/create-tree.js";

describe("injectDirectoryContext", () => {
	it("returns injected text containing the nearest nested AGENTS.md when reading a file inside a nested directory", async () => {
		// given
		const tree = await createTestTree({
			"AGENTS.md": "# root rules",
			"src/AGENTS.md": "# src rules\nuse strict",
			"src/file.ts": "x",
		});
		const cache = new InjectionCache();
		try {
			// when
			const result = await injectDirectoryContext({
				filePath: tree.path("src/file.ts"),
				rootDir: tree.root,
				cache,
				sessionKey: "session-1",
			});

			// then
			expect(result.injectedFiles).toHaveLength(1);
			expect(result.injectedFiles[0]?.absolutePath).toBe(tree.path("src/AGENTS.md"));
			expect(result.injectedText).toContain(`[Directory Context: ${tree.path("src/AGENTS.md")}]`);
			expect(result.injectedText).toContain("# src rules");
			expect(result.errors).toEqual([]);
		} finally {
			await tree.cleanup();
		}
	});

	it("returns an empty result when the file path escapes the project root via a symlink", async () => {
		// given
		const outside = await createTestTree({ "AGENTS.md": "# evil" });
		const tree = await createTestTree({ "src/file.ts": "x" });
		const cache = new InjectionCache();
		try {
			await tree.addSymlink("src/escape", outside.root);

			// when
			const result = await injectDirectoryContext({
				filePath: tree.path("src/escape/AGENTS.md"),
				rootDir: tree.root,
				cache,
				sessionKey: "session-1",
			});

			// then
			expect(result.injectedFiles).toEqual([]);
			expect(result.injectedText).toBe("");
		} finally {
			await tree.cleanup();
			await outside.cleanup();
		}
	});

	it("returns an empty result when the file lives in a sibling root that shares a prefix", async () => {
		// given
		const tree = await createTestTree({});
		const cache = new InjectionCache();
		try {
			const repo = await tree.addDir("repo");
			await tree.addFile("repo-evil/AGENTS.md", "# evil");
			await tree.addFile("repo-evil/file.ts", "x");

			// when
			const result = await injectDirectoryContext({
				filePath: tree.path("repo-evil/file.ts"),
				rootDir: repo,
				cache,
				sessionKey: "session-1",
			});

			// then
			expect(result.injectedFiles).toEqual([]);
			expect(result.injectedText).toBe("");
		} finally {
			await tree.cleanup();
		}
	});

	it("does not re-inject a directory whose AGENTS.md is already cached for the session", async () => {
		// given
		const tree = await createTestTree({
			"src/AGENTS.md": "# src",
			"src/a.ts": "x",
			"src/b.ts": "y",
		});
		const cache = new InjectionCache();
		try {
			await injectDirectoryContext({
				filePath: tree.path("src/a.ts"),
				rootDir: tree.root,
				cache,
				sessionKey: "session-1",
			});

			// when
			const second = await injectDirectoryContext({
				filePath: tree.path("src/b.ts"),
				rootDir: tree.root,
				cache,
				sessionKey: "session-1",
			});

			// then
			expect(second.injectedFiles).toEqual([]);
			expect(second.injectedText).toBe("");
		} finally {
			await tree.cleanup();
		}
	});

	it("re-injects after the session cache is cleared (compaction reset semantics)", async () => {
		// given
		const tree = await createTestTree({
			"src/AGENTS.md": "# src rules",
			"src/file.ts": "x",
		});
		const cache = new InjectionCache();
		try {
			await injectDirectoryContext({
				filePath: tree.path("src/file.ts"),
				rootDir: tree.root,
				cache,
				sessionKey: "session-1",
			});
			cache.clearSession("session-1");

			// when
			const second = await injectDirectoryContext({
				filePath: tree.path("src/file.ts"),
				rootDir: tree.root,
				cache,
				sessionKey: "session-1",
			});

			// then
			expect(second.injectedFiles).toHaveLength(1);
			expect(second.injectedText).toContain("# src rules");
		} finally {
			await tree.cleanup();
		}
	});

	it("captures an AGENTS.md directory read as an error without throwing or injecting it", async () => {
		// given
		const tree = await createTestTree({
			"src/file.ts": "x",
		});
		const cache = new InjectionCache();
		try {
			await tree.addDir("src/AGENTS.md");

			// when
			const result = await injectDirectoryContext({
				filePath: tree.path("src/file.ts"),
				rootDir: tree.root,
				cache,
				sessionKey: "session-1",
			});

			// then
			expect(result.injectedFiles).toEqual([]);
			expect(result.injectedText).toBe("");
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]?.path).toBe(tree.path("src/AGENTS.md"));
		} finally {
			await tree.cleanup();
		}
	});

	it("truncates an oversize AGENTS.md and appends a truncation notice", async () => {
		// given
		const big = "a".repeat(200_000);
		const tree = await createTestTree({
			"src/AGENTS.md": big,
			"src/file.ts": "x",
		});
		const cache = new InjectionCache();
		try {
			// when
			const result = await injectDirectoryContext({
				filePath: tree.path("src/file.ts"),
				rootDir: tree.root,
				cache,
				sessionKey: "session-1",
				config: { maxBytesPerFile: 1024 },
			});

			// then
			expect(result.injectedFiles).toHaveLength(1);
			expect(result.injectedFiles[0]?.truncated).toBe(true);
			expect(result.injectedText).toContain("[Note: Content was truncated to save context window space.");
		} finally {
			await tree.cleanup();
		}
	});

	it("injects multiple AGENTS.md outermost-first when several ancestors have one", async () => {
		// given
		const tree = await createTestTree({
			"AGENTS.md": "# root",
			"src/AGENTS.md": "# src rules",
			"src/components/AGENTS.md": "# components rules",
			"src/components/Button.tsx": "x",
		});
		const cache = new InjectionCache();
		try {
			// when
			const result = await injectDirectoryContext({
				filePath: tree.path("src/components/Button.tsx"),
				rootDir: tree.root,
				cache,
				sessionKey: "session-1",
			});

			// then
			expect(result.injectedFiles).toHaveLength(2);
			expect(result.injectedFiles[0]?.absolutePath).toBe(tree.path("src/AGENTS.md"));
			expect(result.injectedFiles[1]?.absolutePath).toBe(tree.path("src/components/AGENTS.md"));
			const srcIdx = result.injectedText.indexOf("# src rules");
			const componentsIdx = result.injectedText.indexOf("# components rules");
			expect(srcIdx).toBeGreaterThan(-1);
			expect(componentsIdx).toBeGreaterThan(srcIdx);
		} finally {
			await tree.cleanup();
		}
	});

	it("returns an empty result when no nested AGENTS.md exists above the file (root file is excluded)", async () => {
		// given
		const tree = await createTestTree({
			"AGENTS.md": "# root only",
			"file.ts": "x",
		});
		const cache = new InjectionCache();
		try {
			// when
			const result = await injectDirectoryContext({
				filePath: tree.path("file.ts"),
				rootDir: tree.root,
				cache,
				sessionKey: "session-1",
			});

			// then
			expect(result.injectedFiles).toEqual([]);
			expect(result.injectedText).toBe("");
		} finally {
			await tree.cleanup();
		}
	});
});
