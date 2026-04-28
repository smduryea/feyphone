export function logError(
	scope: string,
	error: unknown,
	context?: Record<string, unknown>,
) {
	const err = error instanceof Error ? error : new Error(String(error));
	console.error(`[${scope}]`, err.message, {
		stack: err.stack,
		...context,
	});
}
