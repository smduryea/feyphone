export class ApiError extends Error {
	readonly status: number;
	readonly body: unknown;
	constructor(status: number, body: unknown, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.body = body;
	}
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, init);
	const body = await res.json().catch(() => null);
	if (!res.ok) {
		throw new ApiError(res.status, body, `${res.status} ${res.statusText}`);
	}
	return body as T;
}
