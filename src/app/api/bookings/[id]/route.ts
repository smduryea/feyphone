import { type NextRequest, NextResponse } from "next/server";
import { deleteBooking, updateBooking } from "@/lib/db";
import { withErrorHandler } from "@/lib/apiHandler";

type RouteContext = { params: Promise<{ id: string }> };

export const DELETE = withErrorHandler(
	"api:bookings:DELETE",
	async (_request: NextRequest, { params }: RouteContext) => {
		const { id } = await params;
		await deleteBooking(id);
		return NextResponse.json({ ok: true });
	},
);

export const PATCH = withErrorHandler(
	"api:bookings:PATCH",
	async (request: NextRequest, { params }: RouteContext) => {
		const { id } = await params;
		const body = await request.json();
		await updateBooking(id, body);
		return NextResponse.json({ ok: true });
	},
	{
		OVERLAP: {
			status: 409,
			message: "This slot conflicts with another booking",
		},
	},
);
