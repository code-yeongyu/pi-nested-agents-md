import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import nestedAgentsMd from "../src/index.js";
import { createFakePi } from "../test/fixtures/fake-pi.js";

async function buildFixture(): Promise<{ root: string; cleanup: () => Promise<void> }> {
	const root = await mkdtemp(join(tmpdir(), "pinam-smoke-"));
	const files: Record<string, string> = {
		"AGENTS.md": "# root rules\nalways run tests before push\n",
		"src/AGENTS.md": "# src rules\nprefer composition over inheritance\n",
		"src/components/AGENTS.md": "# components rules\nevery component must export default\n",
		"src/components/Button.tsx": "export default function Button() { return null; }\n",
	};
	for (const [rel, content] of Object.entries(files)) {
		const full = join(root, rel);
		await mkdir(dirname(full), { recursive: true });
		await writeFile(full, content, "utf-8");
	}
	return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

function makeReadEvent(path: string) {
	return {
		type: "tool_result" as const,
		toolCallId: "smoke-1",
		toolName: "read" as const,
		input: { path },
		content: [{ type: "text" as const, text: `original read of ${path}` }],
		isError: false,
	};
}

async function main(): Promise<void> {
	const fixture = await buildFixture();
	console.log(`[smoke] fixture root: ${fixture.root}`);

	const fake = createFakePi({
		cwd: fixture.root,
		sessionFile: "/tmp/smoke-session.jsonl",
	});

	nestedAgentsMd(fake.pi as Parameters<typeof nestedAgentsMd>[0]);

	console.log(`[smoke] registered flags: ${fake.captured.registeredFlags.join(", ")}`);
	console.log(`[smoke] registered commands: ${fake.captured.registeredCommands.join(", ")}`);

	await fake.emit("session_start", { reason: "startup" });

	const buttonPath = join(fixture.root, "src/components/Button.tsx");
	console.log(`\n[smoke] reading: ${buttonPath}`);
	const result = await fake.emit("tool_result", makeReadEvent(buttonPath));
	console.log("[smoke] patched content:");
	console.log("---");
	console.log(JSON.stringify(result, null, 2));
	console.log("---");

	const status = fake.captured.statuses.at(-1);
	console.log(`\n[smoke] status: ${status?.key} = ${JSON.stringify(status?.text)}`);

	console.log("\n[smoke] toggling /nested-agents widget on");
	await fake.runCommand("nested-agents");
	const widget = fake.captured.widgets.at(-1);
	console.log(`[smoke] widget placement: ${widget?.placement}`);
	console.log(`[smoke] widget lines:`);
	for (const line of widget?.lines ?? []) console.log(`  ${line}`);

	const debug = fake.captured.entries.at(-1);
	console.log(`\n[smoke] debug entry: ${debug?.customType}`);
	console.log(JSON.stringify(debug?.data, null, 2));

	console.log("\n[smoke] reading the same file again (expect dedup, no new injection):");
	const dedup = await fake.emit("tool_result", makeReadEvent(buttonPath));
	console.log(`  dedup result: ${dedup === undefined ? "undefined (no patch)" : "<patched>"}`);

	console.log("\n[smoke] firing session_compact, then re-reading the same file:");
	await fake.emit("session_compact", {});
	const reInject = await fake.emit("tool_result", makeReadEvent(buttonPath));
	console.log(`  re-inject result: ${reInject === undefined ? "undefined" : "<patched again>"}`);

	await fixture.cleanup();
	console.log("\n[smoke] OK");
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
