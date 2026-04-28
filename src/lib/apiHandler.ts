import { NextResponse } from "next/server";
import { logError } from "./logger";

type KnownError = { status: number; message: string };

export function withErrorHandler<Args extends unknown[]>(
	scope: string,
	handler: (...args: Args) => Promise<Response>,
	knownErrors?: Record<string, KnownError>,
) {
	return async (...args: Args): Promise<Response> => {
		try {
			return await handler(...args);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			const known = knownErrors?.[message];
			if (known) {
				return NextResponse.json(
					{ error: known.message },
					{ status: known.status },
				);
			}
			logError(scope, error);
			return NextResponse.json(
				{ error: "Internal server error", details: message },
				{ status: 500 },
			);
		}
	};
}
