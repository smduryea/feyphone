import { NextRequest, NextResponse } from "next/server";
import { getBookings, createBooking } from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const weekStart = searchParams.get("weekStart");
  const weekEnd = searchParams.get("weekEnd");

  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: "weekStart and weekEnd required" }, { status: 400 });
  }

  const bookings = await getBookings(weekStart, weekEnd);
  return NextResponse.json(bookings);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, start_time, end_time } = body;

  if (!name || !start_time || !end_time) {
    return NextResponse.json({ error: "name, start_time, end_time required" }, { status: 400 });
  }

  try {
    const booking = await createBooking(uuid(), name, start_time, end_time);
    return NextResponse.json(booking, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "OVERLAP") {
      return NextResponse.json({ error: "This slot overlaps with an existing booking" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }
}
