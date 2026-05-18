import { describe, expect, it } from "vitest";
import nestedAgentsMd from "../src/index.js";
import { createTestTree } from "./fixtures/create-tree.js";
import { createFakePi } from "./fixtures/fake-pi.js";

interface TextBlock {
	type: "text";
	text: string;
}

interface ReadToolResultEvent {
	type: "tool_result";
	toolCallId: string;
	toolName: "read";
	input: { path: string };
	content: TextBlock[];
	isError: boolean;
	details?: unknown;
}

function makeReadEvent(path: string, content = "original", toolCallId = "call-1"): ReadToolResultEvent {
	return {
		type: "tool_result",
		toolCallId,
		toolName: "read",
		input: { path },
		content: [{ type: "text", text: content }],
		isError: false,
	};
}

describe("lifecycle integration", () => {
	it("re-injects nested AGENTS.md after session_compact clears the cache", async () => {
		// given
		const tree = await createTestTree({
			"src/AGENTS.md": "# src rules",
			"src/file.ts": "x",
		});
		const fake = createFakePi({ cwd: tree.root, sessionFile: "/sessions/A.jsonl" });
		nestedAgentsMd(fake.pi as Parameters<typeof nestedAgentsMd>[0]);
		try {
			await fake.emit("session_start", { reason: "startup" });
			const first = (await fake.emit("tool_result", makeReadEvent(tree.path("src/file.ts")))) as
				| { content: TextBlock[] }
				| undefined;
			expect(first?.content).toBeDefined();
			expect(first?.content[1]?.text).toContain("# src rules");

			const cached = (await fake.emit("tool_result", makeReadEvent(tree.path("src/file.ts")))) as
				| { content?: TextBlock[] }
				| undefined;
			expect(cached).toBeUndefined();

			await fake.emit("session_compact", {});

			// when
			const afterCompact = (await fake.emit("tool_result", makeReadEvent(tree.path("src/file.ts")))) as
				| { content: TextBlock[] }
				| undefined;

			// then
			expect(afterCompact?.content).toBeDefined();
			expect(afterCompact?.content[1]?.text).toContain("# src rules");
		} finally {
			await tree.cleanup();
		}
	});

	it("keeps nested AGENTS.md deduped across tool calls until session_compact resets it", async () => {
		// given
		const tree = await createTestTree({
			"src/AGENTS.md": "# src rules",
			"src/file.ts": "x",
		});
		const fake = createFakePi({ cwd: tree.root, sessionFile: "/sessions/A.jsonl" });
		nestedAgentsMd(fake.pi as Parameters<typeof nestedAgentsMd>[0]);
		try {
			await fake.emit("session_start", { reason: "startup" });
			const first = (await fake.emit(
				"tool_result",
				makeReadEvent(tree.path("src/file.ts"), "original", "call-1"),
			)) as { content: TextBlock[] } | undefined;
			const cached = (await fake.emit(
				"tool_result",
				makeReadEvent(tree.path("src/file.ts"), "original", "call-2"),
			)) as { content?: TextBlock[] } | undefined;
			expect(first?.content[1]?.text).toContain("# src rules");
			expect(cached).toBeUndefined();

			// when
			await fake.emit("session_compact", {});
			const afterCompact = (await fake.emit(
				"tool_result",
				makeReadEvent(tree.path("src/file.ts"), "original", "call-3"),
			)) as { content: TextBlock[] } | undefined;

			// then
			expect(afterCompact?.content[1]?.text).toContain("# src rules");
		} finally {
			await tree.cleanup();
		}
	});

	it("isolates injection caches across two distinct sessions", async () => {
		// given
		const tree = await createTestTree({
			"src/AGENTS.md": "# src rules",
			"src/file.ts": "x",
		});
		const fake = createFakePi({ cwd: tree.root, sessionFile: "/sessions/A.jsonl" });
		nestedAgentsMd(fake.pi as Parameters<typeof nestedAgentsMd>[0]);
		try {
			await fake.emit("session_start", { reason: "startup" });
			const aFirst = (await fake.emit("tool_result", makeReadEvent(tree.path("src/file.ts")))) as
				| { content: TextBlock[] }
				| undefined;
			expect(aFirst?.content[1]?.text).toContain("# src rules");

			fake.setSessionFile("/sessions/B.jsonl");

			// when
			const bFirst = (await fake.emit("tool_result", makeReadEvent(tree.path("src/file.ts")))) as
				| { content: TextBlock[] }
				| undefined;

			// then
			expect(bFirst?.content[1]?.text).toContain("# src rules");
		} finally {
			await tree.cleanup();
		}
	});

	it("session_shutdown clears the session cache so the same path can re-inject in a fresh session", async () => {
		// given
		const tree = await createTestTree({
			"src/AGENTS.md": "# src rules",
			"src/file.ts": "x",
		});
		const fake = createFakePi({ cwd: tree.root, sessionFile: "/sessions/A.jsonl" });
		nestedAgentsMd(fake.pi as Parameters<typeof nestedAgentsMd>[0]);
		try {
			await fake.emit("session_start", { reason: "startup" });
			await fake.emit("tool_result", makeReadEvent(tree.path("src/file.ts")));

			// when
			await fake.emit("session_shutdown", { reason: "quit" });
			const afterShutdown = (await fake.emit("tool_result", makeReadEvent(tree.path("src/file.ts")))) as
				| { content?: TextBlock[] }
				| undefined;

			// then
			expect(afterShutdown?.content?.[1]?.text).toContain("# src rules");
		} finally {
			await tree.cleanup();
		}
	});

	it("preserves the original content blocks as a prefix of the patched content", async () => {
		// given
		const tree = await createTestTree({
			"src/AGENTS.md": "# src rules",
			"src/file.ts": "x",
		});
		const fake = createFakePi({ cwd: tree.root, sessionFile: "/sessions/A.jsonl" });
		nestedAgentsMd(fake.pi as Parameters<typeof nestedAgentsMd>[0]);
		try {
			await fake.emit("session_start", { reason: "startup" });
			const original = makeReadEvent(tree.path("src/file.ts"), "block-A");
			original.content.push({ type: "text", text: "block-B" });

			// when
			const result = (await fake.emit("tool_result", original)) as {
				content: TextBlock[];
			};

			// then
			expect(result.content.length).toBe(3);
			expect(result.content[0]).toEqual({ type: "text", text: "block-A" });
			expect(result.content[1]).toEqual({ type: "text", text: "block-B" });
			expect(result.content[2]?.text).toContain("# src rules");
		} finally {
			await tree.cleanup();
		}
	});
});
