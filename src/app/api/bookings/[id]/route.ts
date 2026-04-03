import { NextRequest, NextResponse } from "next/server";
import { deleteBooking, updateBooking } from "@/lib/db";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteBooking(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  try {
    await updateBooking(id, body);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "OVERLAP") {
      return NextResponse.json({ error: "This slot conflicts with another booking" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update booking" }, { status: 500 });
  }
}
