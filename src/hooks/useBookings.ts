"use client";

import { useState, useEffect, useCallback } from "react";
import type { Booking } from "@/lib/types";
import { doRangesOverlap } from "@/lib/dateUtils";
import { ApiError, fetchJson } from "@/lib/fetchJson";
import toast from "react-hot-toast";

function logApiError(label: string, error: unknown) {
	if (error instanceof ApiError) {
		console.error(`[${label}]`, error.status, error.body);
	} else {
		console.error(`[${label}]`, error);
	}
}

export function useBookings(weekStart: Date, weekEnd: Date) {
	const [bookings, setBookings] = useState<Booking[]>([]);
	const [loading, setLoading] = useState(true);

	const fetchBookings = useCallback(
		async (showLoading = false) => {
			if (showLoading) setLoading(true);
			try {
				const data = await fetchJson<Booking[]>(
					`/api/bookings?weekStart=${weekStart.toISOString()}&weekEnd=${weekEnd.toISOString()}`,
				);
				setBookings(data);
			} catch (error) {
				logApiError("useBookings:fetch", error);
				toast.error("Failed to load bookings");
			} finally {
				setLoading(false);
			}
		},
		[weekStart, weekEnd],
	);

	useEffect(() => {
		fetchBookings(true);
	}, [fetchBookings]);

	const createBooking = async (booking: {
		name: string;
		start_time: Date;
		end_time: Date;
	}): Promise<boolean> => {
		const newRange = { start: booking.start_time, end: booking.end_time };
		const overlap = bookings.find((b) =>
			doRangesOverlap(newRange, {
				start: new Date(b.start_time),
				end: new Date(b.end_time),
			}),
		);
		if (overlap) {
			toast.error(`This slot overlaps with ${overlap.name}'s booking`);
			return false;
		}

		try {
			const data = await fetchJson<Booking>("/api/bookings", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: booking.name,
					start_time: booking.start_time.toISOString(),
					end_time: booking.end_time.toISOString(),
				}),
			});
			setBookings((prev) =>
				[...prev, data].sort(
					(a, b) =>
						new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
				),
			);
			toast.success("Booking created!");
			return true;
		} catch (error) {
			if (error instanceof ApiError && error.status === 409) {
				toast.error("This slot was just booked by someone else. Refreshing...");
				fetchBookings();
				return false;
			}
			logApiError("useBookings:create", error);
			toast.error("Failed to create booking");
			fetchBookings();
			return false;
		}
	};

	const deleteBooking = async (id: string) => {
		const prev = bookings;
		setBookings((b) => b.filter((x) => x.id !== id));

		try {
			await fetchJson(`/api/bookings/${id}`, { method: "DELETE" });
			toast.success("Booking deleted");
		} catch (error) {
			logApiError("useBookings:delete", error);
			toast.error("Failed to delete booking");
			setBookings(prev);
		}
	};

	const updateBooking = async (
		id: string,
		start_time: Date,
		end_time: Date,
		name?: string,
	): Promise<boolean> => {
		const newRange = { start: start_time, end: end_time };
		const overlap = bookings.find(
			(b) =>
				b.id !== id &&
				doRangesOverlap(newRange, {
					start: new Date(b.start_time),
					end: new Date(b.end_time),
				}),
		);
		if (overlap) {
			toast.error(`This slot overlaps with ${overlap.name}'s booking`);
			return false;
		}

		const prev = bookings;
		setBookings((bs) =>
			bs
				.map((b) =>
					b.id === id
						? {
								...b,
								start_time: start_time.toISOString(),
								end_time: end_time.toISOString(),
								...(name !== undefined ? { name } : {}),
							}
						: b,
				)
				.sort(
					(a, b) =>
						new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
				),
		);

		try {
			const fields: Record<string, string> = {
				start_time: start_time.toISOString(),
				end_time: end_time.toISOString(),
			};
			if (name !== undefined) fields.name = name;

			await fetchJson(`/api/bookings/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(fields),
			});

			toast.success("Booking updated!");
			return true;
		} catch (error) {
			setBookings(prev);
			if (error instanceof ApiError && error.status === 409) {
				toast.error("This slot conflicts with another booking.");
				return false;
			}
			logApiError("useBookings:update", error);
			toast.error("Failed to update booking");
			return false;
		}
	};

	return {
		bookings,
		loading,
		createBooking,
		deleteBooking,
		updateBooking,
		refetch: fetchBookings,
	};
}
