export class InjectionFileReadError extends Error {
	constructor(
		public readonly path: string,
		cause: unknown,
	) {
		const message = cause instanceof Error ? cause.message : String(cause);
		super(`Failed to read ${path}: ${message}`);
		this.name = "InjectionFileReadError";
	}
}
