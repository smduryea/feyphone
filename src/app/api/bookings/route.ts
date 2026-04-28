import { type NextRequest, NextResponse } from "next/server";
import { getBookings, createBooking } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { withErrorHandler } from "@/lib/apiHandler";

export const GET = withErrorHandler(
	"api:bookings:GET",
	async (request: NextRequest) => {
		const { searchParams } = request.nextUrl;
		const weekStart = searchParams.get("weekStart");
		const weekEnd = searchParams.get("weekEnd");

		if (!weekStart || !weekEnd) {
			return NextResponse.json(
				{ error: "weekStart and weekEnd required" },
				{ status: 400 },
			);
		}

		const bookings = await getBookings(weekStart, weekEnd);
		return NextResponse.json(bookings);
	},
);

export const POST = withErrorHandler(
	"api:bookings:POST",
	async (request: NextRequest) => {
		const body = await request.json();
		const { name, start_time, end_time } = body;

		if (!name || !start_time || !end_time) {
			return NextResponse.json(
				{ error: "name, start_time, end_time required" },
				{ status: 400 },
			);
		}

		const booking = await createBooking(uuid(), name, start_time, end_time);
		return NextResponse.json(booking, { status: 201 });
	},
	{
		OVERLAP: {
			status: 409,
			message: "This slot overlaps with an existing booking",
		},
	},
);
