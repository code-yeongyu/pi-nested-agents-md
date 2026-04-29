import { describe, expect, it } from "vitest";
import { InjectionCache } from "../src/core/injection-cache";

describe("InjectionCache", () => {
	it("reports a directory as injected after marking it for a session", () => {
		// given
		const cache = new InjectionCache();

		// when
		cache.markInjected("session-1", "/abs/src");

		// then
		expect(cache.hasInjected("session-1", "/abs/src")).toBe(true);
	});

	it("does not consider a directory injected when no markings exist", () => {
		// given
		const cache = new InjectionCache();

		// when
		const injected = cache.hasInjected("session-1", "/abs/src");

		// then
		expect(injected).toBe(false);
	});

	it("dedupes a re-marked directory in the same session", () => {
		// given
		const cache = new InjectionCache();
		cache.markInjected("session-1", "/abs/src");

		// when
		cache.markInjected("session-1", "/abs/src");

		// then
		expect(cache.getCacheSize("session-1")).toBe(1);
	});

	it("clears injections for one session without affecting another (multi-session isolation)", () => {
		// given
		const cache = new InjectionCache();
		cache.markInjected("session-A", "/abs/src");
		cache.markInjected("session-B", "/abs/src");

		// when
		cache.clearSession("session-A");

		// then
		expect(cache.hasInjected("session-A", "/abs/src")).toBe(false);
		expect(cache.hasInjected("session-B", "/abs/src")).toBe(true);
	});

	it("re-injects after a session is cleared (compaction reset semantics)", () => {
		// given
		const cache = new InjectionCache();
		cache.markInjected("session-1", "/abs/src");

		// when
		cache.clearSession("session-1");

		// then
		expect(cache.hasInjected("session-1", "/abs/src")).toBe(false);
	});

	it("clears all sessions on clearAll", () => {
		// given
		const cache = new InjectionCache();
		cache.markInjected("session-A", "/abs/src");
		cache.markInjected("session-B", "/abs/lib");

		// when
		cache.clearAll();

		// then
		expect(cache.hasInjected("session-A", "/abs/src")).toBe(false);
		expect(cache.hasInjected("session-B", "/abs/lib")).toBe(false);
	});

	it("returns the count of injected directories per session", () => {
		// given
		const cache = new InjectionCache();
		cache.markInjected("session-1", "/abs/a");
		cache.markInjected("session-1", "/abs/b");
		cache.markInjected("session-1", "/abs/c");

		// when
		const size = cache.getCacheSize("session-1");

		// then
		expect(size).toBe(3);
	});

	it("returns 0 for the count of an unknown session", () => {
		// given
		const cache = new InjectionCache();

		// when
		const size = cache.getCacheSize("unknown");

		// then
		expect(size).toBe(0);
	});

	it("lists injected directories for a session in insertion order", () => {
		// given
		const cache = new InjectionCache();
		cache.markInjected("session-1", "/abs/a");
		cache.markInjected("session-1", "/abs/b");

		// when
		const list = cache.listInjected("session-1");

		// then
		expect(list).toEqual(["/abs/a", "/abs/b"]);
	});
});
