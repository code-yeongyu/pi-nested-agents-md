import { describe, expect, it } from "vitest";
import { injectDirectoryContext } from "../src/core/inject-directory-context.js";
import { InjectionCache } from "../src/core/injection-cache.js";
import { createTestTree } from "./fixtures/create-tree.js";

interface TextBlock {
	type: "text";
	text: string;
}

interface ImageBlock {
	type: "image";
	data: string;
	mimeType: string;
}

type Block = TextBlock | ImageBlock;

interface ReadToolResultLike {
	toolName: string;
	input: Record<string, unknown>;
	content: Block[];
	isError: boolean;
}

interface MiddlewareContext {
	cwd: string;
	cache: InjectionCache;
	sessionKey: string;
}

type Handler = (event: ReadToolResultLike, ctx: MiddlewareContext) => Promise<{ content?: Block[] } | undefined>;

async function runMiddleware(
	event: ReadToolResultLike,
	handlers: Handler[],
	ctx: MiddlewareContext,
): Promise<ReadToolResultLike> {
	let current: ReadToolResultLike = { ...event, content: [...event.content] };
	for (const handler of handlers) {
		const result = await handler(current, ctx);
		if (result?.content !== undefined) {
			current = { ...current, content: result.content };
		}
	}
	return current;
}

const nestedAgentsHandler: Handler = async (event, ctx) => {
	if (event.toolName !== "read") return undefined;
	if (event.isError) return undefined;
	const filePath = event.input.path as string | undefined;
	if (!filePath) return undefined;
	const hasText = event.content.some((b) => b.type === "text");
	if (!hasText) return undefined;

	const result = await injectDirectoryContext({
		filePath,
		rootDir: ctx.cwd,
		cache: ctx.cache,
		sessionKey: ctx.sessionKey,
	});

	if (!result.injectedText) return undefined;

	return {
		content: [...event.content, { type: "text", text: result.injectedText } as TextBlock],
	};
};

describe("tool_result middleware integration", () => {
	it("appends to the latest content from a prior middleware (chaining safety)", async () => {
		// given
		const tree = await createTestTree({
			"src/AGENTS.md": "# src rules",
			"src/file.ts": "x",
		});
		const cache = new InjectionCache();
		const ctx: MiddlewareContext = { cwd: tree.root, cache, sessionKey: "session-1" };
		const priorHandler: Handler = async (event) => ({
			content: event.content.map((b) => (b.type === "text" ? ({ type: "text", text: "modified" } as TextBlock) : b)),
		});
		const event: ReadToolResultLike = {
			toolName: "read",
			input: { path: tree.path("src/file.ts") },
			content: [{ type: "text", text: "original content" }],
			isError: false,
		};
		try {
			// when
			const final = await runMiddleware(event, [priorHandler, nestedAgentsHandler], ctx);

			// then
			const allText = final.content
				.filter((b): b is TextBlock => b.type === "text")
				.map((b) => b.text)
				.join("\n");
			expect(allText).toContain("modified");
			expect(allText).toContain("# src rules");
		} finally {
			await tree.cleanup();
		}
	});

	it("returns no patch when the tool is not read", async () => {
		// given
		const tree = await createTestTree({ "src/AGENTS.md": "# src", "src/file.ts": "x" });
		const cache = new InjectionCache();
		const ctx: MiddlewareContext = { cwd: tree.root, cache, sessionKey: "session-1" };
		const event: ReadToolResultLike = {
			toolName: "bash",
			input: { command: "ls" },
			content: [{ type: "text", text: "listing" }],
			isError: false,
		};
		try {
			// when
			const result = await nestedAgentsHandler(event, ctx);

			// then
			expect(result).toBeUndefined();
		} finally {
			await tree.cleanup();
		}
	});

	it("returns no patch when the read result is an error", async () => {
		// given
		const tree = await createTestTree({ "src/AGENTS.md": "# src", "src/file.ts": "x" });
		const cache = new InjectionCache();
		const ctx: MiddlewareContext = { cwd: tree.root, cache, sessionKey: "session-1" };
		const event: ReadToolResultLike = {
			toolName: "read",
			input: { path: tree.path("src/file.ts") },
			content: [{ type: "text", text: "error message" }],
			isError: true,
		};
		try {
			// when
			const result = await nestedAgentsHandler(event, ctx);

			// then
			expect(result).toBeUndefined();
		} finally {
			await tree.cleanup();
		}
	});

	it("returns no patch when the content has no text blocks (image-only result)", async () => {
		// given
		const tree = await createTestTree({ "src/AGENTS.md": "# src", "src/file.png": "x" });
		const cache = new InjectionCache();
		const ctx: MiddlewareContext = { cwd: tree.root, cache, sessionKey: "session-1" };
		const event: ReadToolResultLike = {
			toolName: "read",
			input: { path: tree.path("src/file.png") },
			content: [{ type: "image", data: "base64...", mimeType: "image/png" }],
			isError: false,
		};
		try {
			// when
			const result = await nestedAgentsHandler(event, ctx);

			// then
			expect(result).toBeUndefined();
		} finally {
			await tree.cleanup();
		}
	});

	it("preserves the original content blocks as a prefix of the returned content", async () => {
		// given
		const tree = await createTestTree({
			"src/AGENTS.md": "# src rules",
			"src/file.ts": "x",
		});
		const cache = new InjectionCache();
		const ctx: MiddlewareContext = { cwd: tree.root, cache, sessionKey: "session-1" };
		const originalContent: Block[] = [
			{ type: "text", text: "first block" },
			{ type: "text", text: "second block" },
		];
		const event: ReadToolResultLike = {
			toolName: "read",
			input: { path: tree.path("src/file.ts") },
			content: originalContent,
			isError: false,
		};
		try {
			// when
			const result = await nestedAgentsHandler(event, ctx);

			// then
			expect(result?.content).toBeDefined();
			expect(result?.content?.slice(0, 2)).toEqual(originalContent);
			expect(result?.content?.length).toBe(3);
			const last = result?.content?.[2];
			expect(last?.type).toBe("text");
			expect((last as TextBlock).text).toContain("# src rules");
		} finally {
			await tree.cleanup();
		}
	});
});
