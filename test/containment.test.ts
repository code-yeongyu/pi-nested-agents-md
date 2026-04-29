import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAndContain } from "../src/core/containment.js";
import { createTestTree } from "./fixtures/create-tree.js";

describe("resolveAndContain", () => {
	it("returns canonical paths when the file is inside the project root", async () => {
		// given
		const tree = await createTestTree({ "src/file.ts": "x" });
		try {
			// when
			const result = await resolveAndContain({
				filePath: tree.path("src/file.ts"),
				rootDir: tree.root,
			});

			// then
			expect(result).not.toBeNull();
			expect(result?.canonicalRoot).toBe(tree.root);
			expect(result?.canonicalPath).toBe(tree.path("src/file.ts"));
		} finally {
			await tree.cleanup();
		}
	});

	it("returns null when the file resolves outside the project root", async () => {
		// given
		const tree = await createTestTree({ "src/file.ts": "x", "../outside-of-root.ts": "y" });
		try {
			const escaping = join(tree.root, "..", "outside-of-root.ts");

			// when
			const result = await resolveAndContain({ filePath: escaping, rootDir: tree.root });

			// then
			expect(result).toBeNull();
		} finally {
			await tree.cleanup();
		}
	});

	it("returns null for a sibling root that shares a prefix (repo vs repo-evil)", async () => {
		// given
		const tree = await createTestTree({});
		try {
			const repo = await tree.addDir("repo");
			await tree.addFile("repo/file.ts", "x");
			await tree.addDir("repo-evil");
			await tree.addFile("repo-evil/file.ts", "y");

			// when
			const result = await resolveAndContain({
				filePath: tree.path("repo-evil/file.ts"),
				rootDir: repo,
			});

			// then
			expect(result).toBeNull();
		} finally {
			await tree.cleanup();
		}
	});

	it("returns null when a symlink inside the project root escapes outside the root", async () => {
		// given
		const outside = await createTestTree({ "secret.ts": "secret" });
		const tree = await createTestTree({ "src/file.ts": "x" });
		try {
			await tree.addSymlink("src/escape", outside.root);

			// when
			const result = await resolveAndContain({
				filePath: tree.path("src/escape/secret.ts"),
				rootDir: tree.root,
			});

			// then
			expect(result).toBeNull();
		} finally {
			await tree.cleanup();
			await outside.cleanup();
		}
	});

	it("returns null when the file path equals the project root itself", async () => {
		// given
		const tree = await createTestTree({ "AGENTS.md": "# root" });
		try {
			// when
			const result = await resolveAndContain({ filePath: tree.root, rootDir: tree.root });

			// then
			expect(result).toBeNull();
		} finally {
			await tree.cleanup();
		}
	});

	it("resolves a relative file path against the project root", async () => {
		// given
		const tree = await createTestTree({ "src/file.ts": "x" });
		try {
			// when
			const result = await resolveAndContain({ filePath: "src/file.ts", rootDir: tree.root });

			// then
			expect(result).not.toBeNull();
			expect(result?.canonicalPath).toBe(tree.path("src/file.ts"));
		} finally {
			await tree.cleanup();
		}
	});

	it("returns null for a file path that does not exist", async () => {
		// given
		const tree = await createTestTree({ "src/file.ts": "x" });
		try {
			// when
			const result = await resolveAndContain({
				filePath: tree.path("src/missing.ts"),
				rootDir: tree.root,
			});

			// then
			expect(result).toBeNull();
		} finally {
			await tree.cleanup();
		}
	});
});
