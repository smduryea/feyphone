"use client";

import { useEffect } from "react";
import { logError } from "@/lib/logger";

export default function GlobalError({
	error,
	unstable_retry,
}: {
	error: Error & { digest?: string };
	unstable_retry: () => void;
}) {
	useEffect(() => {
		logError("global", error, { digest: error.digest });
	}, [error]);

	return (
		<html lang="en">
			<body className="min-h-screen flex flex-col items-center justify-center bg-amber-50 font-mono p-6">
				<div className="border-2 border-black bg-white p-6 max-w-md">
					<h2 className="text-lg font-bold mb-2">Something went wrong</h2>
					<p className="text-sm mb-4 break-all">{error.message}</p>
					{error.digest && (
						<p className="text-xs text-gray-600 mb-4">
							digest: {error.digest}
						</p>
					)}
					<button
						type="button"
						onClick={() => unstable_retry()}
						className="border-2 border-black px-4 py-2 hover:bg-black hover:text-white transition-colors"
					>
						Try again
					</button>
				</div>
			</body>
		</html>
	);
}
