import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface TestTree {
	root: string;
	cleanup: () => Promise<void>;
	path: (relative: string) => string;
	addFile: (relative: string, content: string) => Promise<string>;
	addSymlink: (linkPath: string, target: string) => Promise<string>;
	addDir: (relative: string) => Promise<string>;
}

export async function createTestTree(files: Record<string, string> = {}): Promise<TestTree> {
	const tempRoot = await mkdtemp(join(tmpdir(), "pinam-"));
	const root = await realpath(tempRoot);

	for (const [relativePath, content] of Object.entries(files)) {
		const fullPath = join(root, relativePath);
		await mkdir(dirname(fullPath), { recursive: true });
		await writeFile(fullPath, content, "utf-8");
	}

	const path = (relative: string): string => join(root, relative);

	return {
		root,
		cleanup: async () => {
			await rm(tempRoot, { recursive: true, force: true });
		},
		path,
		addFile: async (relative: string, content: string) => {
			const fullPath = path(relative);
			await mkdir(dirname(fullPath), { recursive: true });
			await writeFile(fullPath, content, "utf-8");
			return fullPath;
		},
		addSymlink: async (linkPath: string, target: string) => {
			const fullLink = path(linkPath);
			await mkdir(dirname(fullLink), { recursive: true });
			await symlink(target, fullLink);
			return fullLink;
		},
		addDir: async (relative: string) => {
			const fullPath = path(relative);
			await mkdir(fullPath, { recursive: true });
			return fullPath;
		},
	};
}
