import { describe, expect, it } from "vitest";
import { formatDirectoryContext } from "../src/core/format.js";

describe("formatDirectoryContext", () => {
	it("renders the omo-exact directory-context block when content is not truncated", () => {
		// given
		const absolutePath = "/abs/repo/src/AGENTS.md";
		const content = "# rules\nbe nice";

		// when
		const formatted = formatDirectoryContext({ absolutePath, content, truncated: false });

		// then
		expect(formatted).toBe("\n\n[Directory Context: /abs/repo/src/AGENTS.md]\n# rules\nbe nice");
	});

	it("appends a truncation notice that includes the absolute path when truncated", () => {
		// given
		const absolutePath = "/abs/repo/src/AGENTS.md";
		const content = "head";

		// when
		const formatted = formatDirectoryContext({ absolutePath, content, truncated: true });

		// then
		expect(formatted.startsWith("\n\n[Directory Context: /abs/repo/src/AGENTS.md]\nhead")).toBe(true);
		expect(formatted.endsWith(
			"[Note: Content was truncated to save context window space. For full context, please read the file directly: /abs/repo/src/AGENTS.md]",
		)).toBe(true);
	});

	it("formats the directory-context header even when the content is empty", () => {
		// given
		const absolutePath = "/abs/repo/src/AGENTS.md";

		// when
		const formatted = formatDirectoryContext({ absolutePath, content: "", truncated: false });

		// then
		expect(formatted).toBe("\n\n[Directory Context: /abs/repo/src/AGENTS.md]\n");
	});

	it("preserves multiline content verbatim between the header and the truncation notice", () => {
		// given
		const absolutePath = "/abs/repo/AGENTS.md";
		const content = "line one\nline two\nline three";

		// when
		const formatted = formatDirectoryContext({ absolutePath, content, truncated: false });

		// then
		expect(formatted).toContain("line one\nline two\nline three");
		expect(formatted).not.toContain("Note: Content was truncated");
	});
});
