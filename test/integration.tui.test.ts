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
}

function makeReadEvent(path: string, content = "original"): ReadToolResultEvent {
	return {
		type: "tool_result",
		toolCallId: "call-1",
		toolName: "read",
		input: { path },
		content: [{ type: "text", text: content }],
		isError: false,
	};
}

describe("TUI integration", () => {
	it("calls setStatus with the themed dim count after injection (hasUI=true)", async () => {
		// given
		const tree = await createTestTree({
			"src/AGENTS.md": "# src",
			"src/file.ts": "x",
		});
		const fake = createFakePi({ cwd: tree.root, sessionFile: "/sessions/A.jsonl" });
		nestedAgentsMd(fake.pi as unknown as Parameters<typeof nestedAgentsMd>[0]);
		try {
			await fake.emit("session_start", { reason: "startup" });

			// when
			await fake.emit("tool_result", makeReadEvent(tree.path("src/file.ts")));

			// then
			const status = fake.captured.statuses.at(-1);
			expect(status?.key).toBe("ext:nested-agents:status");
			expect(status?.text).toBe("[dim]🤖 1[/dim]");
		} finally {
			await tree.cleanup();
		}
	});

	it("never calls setStatus or setWidget when hasUI is false but still injects", async () => {
		// given
		const tree = await createTestTree({
			"src/AGENTS.md": "# src",
			"src/file.ts": "x",
		});
		const fake = createFakePi({
			cwd: tree.root,
			sessionFile: "/sessions/A.jsonl",
			hasUI: false,
		});
		nestedAgentsMd(fake.pi as unknown as Parameters<typeof nestedAgentsMd>[0]);
		try {
			await fake.emit("session_start", { reason: "startup" });

			// when
			const result = (await fake.emit("tool_result", makeReadEvent(tree.path("src/file.ts")))) as {
				content: TextBlock[];
			};

			// then
			expect(fake.captured.statuses).toEqual([]);
			expect(fake.captured.widgets).toEqual([]);
			expect(result.content[1]?.text).toContain("# src");
		} finally {
			await tree.cleanup();
		}
	});

	it("does not inject and registers no UI when --no-nested-agents flag is set", async () => {
		// given
		const tree = await createTestTree({
			"src/AGENTS.md": "# src",
			"src/file.ts": "x",
		});
		const fake = createFakePi({
			cwd: tree.root,
			sessionFile: "/sessions/A.jsonl",
			flagValues: { "no-nested-agents": true },
		});
		nestedAgentsMd(fake.pi as unknown as Parameters<typeof nestedAgentsMd>[0]);
		try {
			await fake.emit("session_start", { reason: "startup" });

			// when
			const result = await fake.emit("tool_result", makeReadEvent(tree.path("src/file.ts")));

			// then
			expect(result).toBeUndefined();
			expect(fake.captured.statuses.every((entry) => entry.text === undefined)).toBe(true);
			expect(fake.captured.widgets.every((entry) => entry.lines === undefined)).toBe(true);
		} finally {
			await tree.cleanup();
		}
	});

	it("renders setWidget aboveEditor with themed lines when /nested-agents toggles visibility on", async () => {
		// given
		const tree = await createTestTree({
			"src/AGENTS.md": "# src",
			"src/components/AGENTS.md": "# components",
			"src/components/Button.tsx": "x",
		});
		const fake = createFakePi({ cwd: tree.root, sessionFile: "/sessions/A.jsonl" });
		nestedAgentsMd(fake.pi as unknown as Parameters<typeof nestedAgentsMd>[0]);
		try {
			await fake.emit("session_start", { reason: "startup" });
			await fake.emit("tool_result", makeReadEvent(tree.path("src/components/Button.tsx")));

			// when
			await fake.runCommand("nested-agents");

			// then
			const widget = fake.captured.widgets.at(-1);
			expect(widget?.key).toBe("ext:nested-agents:widget");
			expect(widget?.placement).toBe("aboveEditor");
			expect(widget?.lines?.[0]).toBe("[accent]Nested Context:[/accent]");
			expect(widget?.lines?.some((line) => line.includes("src/AGENTS.md"))).toBe(true);
			expect(widget?.lines?.some((line) => line.includes("src/components/AGENTS.md"))).toBe(true);
		} finally {
			await tree.cleanup();
		}
	});

	it("toggling the slash command twice hides the widget on the second invocation", async () => {
		// given
		const tree = await createTestTree({
			"src/AGENTS.md": "# src",
			"src/file.ts": "x",
		});
		const fake = createFakePi({ cwd: tree.root, sessionFile: "/sessions/A.jsonl" });
		nestedAgentsMd(fake.pi as unknown as Parameters<typeof nestedAgentsMd>[0]);
		try {
			await fake.emit("session_start", { reason: "startup" });
			await fake.emit("tool_result", makeReadEvent(tree.path("src/file.ts")));
			await fake.runCommand("nested-agents");

			// when
			await fake.runCommand("nested-agents");

			// then
			const widget = fake.captured.widgets.at(-1);
			expect(widget?.key).toBe("ext:nested-agents:widget");
			expect(widget?.lines).toBeUndefined();
		} finally {
			await tree.cleanup();
		}
	});

	it("appends a debug entry containing the cache state when the slash command runs", async () => {
		// given
		const tree = await createTestTree({
			"src/AGENTS.md": "# src",
			"src/file.ts": "x",
		});
		const fake = createFakePi({ cwd: tree.root, sessionFile: "/sessions/A.jsonl" });
		nestedAgentsMd(fake.pi as unknown as Parameters<typeof nestedAgentsMd>[0]);
		try {
			await fake.emit("session_start", { reason: "startup" });
			await fake.emit("tool_result", makeReadEvent(tree.path("src/file.ts")));

			// when
			await fake.runCommand("nested-agents");

			// then
			const entry = fake.captured.entries.at(-1);
			expect(entry?.customType).toBe("nested-agents-md:debug");
			const data = entry?.data as { cacheSize: number; injectedFiles: unknown[] } | undefined;
			expect(data?.cacheSize).toBe(1);
			expect(data?.injectedFiles).toHaveLength(1);
		} finally {
			await tree.cleanup();
		}
	});

	it("renders truncation as a warning-colored line in the widget", async () => {
		// given
		const big = "a".repeat(200_000);
		const tree = await createTestTree({
			"src/AGENTS.md": big,
			"src/file.ts": "x",
		});
		const fake = createFakePi({ cwd: tree.root, sessionFile: "/sessions/A.jsonl" });
		nestedAgentsMd(fake.pi as unknown as Parameters<typeof nestedAgentsMd>[0]);
		try {
			await fake.emit("session_start", { reason: "startup" });
			await fake.emit("tool_result", makeReadEvent(tree.path("src/file.ts")));

			// when
			await fake.runCommand("nested-agents");

			// then
			const widget = fake.captured.widgets.at(-1);
			expect(widget?.lines?.some((line) => line.startsWith("[warning]") && line.includes("(truncated)"))).toBe(true);
		} finally {
			await tree.cleanup();
		}
	});

	it("registers the --no-nested-agents flag and the /nested-agents command", () => {
		// given
		const tree = { root: "/tmp/whatever" };

		// when
		const fake = createFakePi({ cwd: tree.root, sessionFile: "/sessions/A.jsonl" });
		nestedAgentsMd(fake.pi as unknown as Parameters<typeof nestedAgentsMd>[0]);

		// then
		expect(fake.captured.registeredFlags).toContain("no-nested-agents");
		expect(fake.captured.registeredCommands).toContain("nested-agents");
	});
});
