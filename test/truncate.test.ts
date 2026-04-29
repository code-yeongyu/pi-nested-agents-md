import { describe, expect, it } from "vitest";
import { truncateBytes } from "../src/core/truncate.js";

describe("truncateBytes", () => {
	it("returns the original content when smaller than the maxBytes budget", () => {
		// given
		const content = "hello world";

		// when
		const result = truncateBytes(content, 1024);

		// then
		expect(result.result).toBe(content);
		expect(result.truncated).toBe(false);
		expect(result.originalBytes).toBe(11);
		expect(result.resultBytes).toBe(11);
	});

	it("returns the original content when its byte length equals the maxBytes budget", () => {
		// given
		const content = "abcdefghij";

		// when
		const result = truncateBytes(content, 10);

		// then
		expect(result.result).toBe(content);
		expect(result.truncated).toBe(false);
	});

	it("truncates and reports truncated=true when content exceeds maxBytes", () => {
		// given
		const content = "a".repeat(2048);

		// when
		const result = truncateBytes(content, 1024);

		// then
		expect(result.truncated).toBe(true);
		expect(result.resultBytes).toBeLessThanOrEqual(1024);
		expect(result.originalBytes).toBe(2048);
		expect(result.result.length).toBeLessThanOrEqual(1024);
		expect(content.startsWith(result.result)).toBe(true);
	});

	it("never splits a multi-byte UTF-8 code point at the truncation boundary", () => {
		// given
		const heart = "💖";
		const content = `${"a".repeat(10)}${heart}${"b".repeat(10)}`;

		// when
		const result = truncateBytes(content, 12);

		// then
		expect(result.truncated).toBe(true);
		expect(result.result).toBe("a".repeat(10));
		expect(result.result.endsWith("\uFFFD")).toBe(false);
	});

	it("returns an empty result for empty input regardless of maxBytes", () => {
		// given
		const content = "";

		// when
		const result = truncateBytes(content, 16);

		// then
		expect(result.result).toBe("");
		expect(result.truncated).toBe(false);
		expect(result.originalBytes).toBe(0);
		expect(result.resultBytes).toBe(0);
	});

	it("handles 2-byte UTF-8 characters at the boundary safely", () => {
		// given
		const content = "ééééééééé";

		// when
		const result = truncateBytes(content, 5);

		// then
		expect(result.truncated).toBe(true);
		expect(result.result).toBe("éé");
	});

	it("handles 3-byte UTF-8 characters at the boundary safely", () => {
		// given
		const content = "한글한글한글";

		// when
		const result = truncateBytes(content, 8);

		// then
		expect(result.truncated).toBe(true);
		expect(result.result).toBe("한글");
	});
});
