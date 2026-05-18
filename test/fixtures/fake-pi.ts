type EventHandler = (event: unknown, ctx: unknown) => Promise<unknown> | unknown;

export interface CapturedNotify {
	message: string;
	level?: string;
}

export interface CapturedStatus {
	key: string;
	text: string | undefined;
}

export interface CapturedWidget {
	key: string;
	lines: string[] | undefined;
	placement?: string;
}

export interface CapturedEntry {
	customType: string;
	data: unknown;
}

export interface FakePiOptions {
	hasUI?: boolean;
	cwd: string;
	sessionFile?: string | null;
	flagValues?: Record<string, unknown>;
}

export interface FakePi {
	pi: {
		on(event: string, handler: EventHandler): void;
		registerCommand(
			name: string,
			options: {
				description?: string;
				handler: (args: string, ctx: unknown) => Promise<void> | void;
			},
		): void;
		registerFlag(name: string, options: { description?: string; type?: string; default?: unknown }): void;
		getFlag(name: string): unknown;
		appendEntry(customType: string, data?: unknown): void;
	};
	ctx: {
		hasUI: boolean;
		cwd: string;
		signal?: AbortSignal;
		sessionManager: { getSessionFile(): string | null };
		ui: {
			theme: { fg(color: string, text: string): string };
			notify(message: string, level?: string): void;
			setStatus(key: string, text: string | undefined): void;
			setWidget(key: string, lines: string[] | undefined, options?: { placement?: string }): void;
		};
	};
	captured: {
		statuses: CapturedStatus[];
		widgets: CapturedWidget[];
		notifications: CapturedNotify[];
		entries: CapturedEntry[];
		registeredFlags: string[];
		registeredCommands: string[];
	};
	emit: (event: string, payload: unknown) => Promise<unknown>;
	runCommand: (name: string, args?: string) => Promise<void>;
	setSessionFile: (file: string | null) => void;
	setHasUI: (hasUI: boolean) => void;
}

export function createFakePi(options: FakePiOptions): FakePi {
	const handlers = new Map<string, EventHandler[]>();
	const commands = new Map<string, (args: string, ctx: unknown) => Promise<void> | void>();
	const flagValues: Record<string, unknown> = { ...(options.flagValues ?? {}) };
	const captured: FakePi["captured"] = {
		statuses: [],
		widgets: [],
		notifications: [],
		entries: [],
		registeredFlags: [],
		registeredCommands: [],
	};
	let sessionFile: string | null = options.sessionFile ?? null;
	let hasUI = options.hasUI ?? true;

	const ctx: FakePi["ctx"] = {
		get hasUI() {
			return hasUI;
		},
		cwd: options.cwd,
		sessionManager: {
			getSessionFile: () => sessionFile,
		},
		ui: {
			theme: { fg: (color, text) => `[${color}]${text}[/${color}]` },
			notify: (message, level) => {
				const notification: CapturedNotify = { message };
				if (level !== undefined) notification.level = level;
				captured.notifications.push(notification);
			},
			setStatus: (key, text) => captured.statuses.push({ key, text }),
			setWidget: (key, lines, opts) => {
				const widget: CapturedWidget = { key, lines };
				if (opts?.placement !== undefined) widget.placement = opts.placement;
				captured.widgets.push(widget);
			},
		},
	};

	const pi: FakePi["pi"] = {
		on(event, handler) {
			let bucket = handlers.get(event);
			if (!bucket) {
				bucket = [];
				handlers.set(event, bucket);
			}
			bucket.push(handler);
		},
		registerCommand(name, opts) {
			commands.set(name, opts.handler);
			captured.registeredCommands.push(name);
		},
		registerFlag(name, _opts) {
			captured.registeredFlags.push(name);
			if (!(name in flagValues) && _opts.default !== undefined) {
				flagValues[name] = _opts.default;
			}
		},
		getFlag(name) {
			return flagValues[name];
		},
		appendEntry(customType, data) {
			captured.entries.push({ customType, data });
		},
	};

	return {
		pi,
		ctx,
		captured,
		emit: async (event, payload) => {
			const bucket = handlers.get(event) ?? [];
			let lastResult: unknown;
			for (const handler of bucket) {
				lastResult = await handler(payload, ctx);
			}
			return lastResult;
		},
		runCommand: async (name, args = "") => {
			const handler = commands.get(name);
			if (!handler) throw new Error(`Command '${name}' not registered`);
			await handler(args, ctx);
		},
		setSessionFile: (file) => {
			sessionFile = file;
		},
		setHasUI: (next) => {
			hasUI = next;
		},
	};
}
