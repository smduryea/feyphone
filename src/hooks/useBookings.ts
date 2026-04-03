"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Booking } from "@/lib/types";
import { doRangesOverlap } from "@/lib/dateUtils";
import toast from "react-hot-toast";

export function useBookings(weekStart: Date, weekEnd: Date) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const res = await fetch(
          `/api/bookings?weekStart=${weekStart.toISOString()}&weekEnd=${weekEnd.toISOString()}`
        );
        if (!res.ok) throw new Error("fetch failed");
        const data: Booking[] = await res.json();
        setBookings(data);
      } catch {
        toast.error("Failed to load bookings");
      }
      setLoading(false);
    },
    [weekStart, weekEnd]
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
      })
    );
    if (overlap) {
      toast.error(`This slot overlaps with ${overlap.name}'s booking`);
      return false;
    }

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: booking.name,
          start_time: booking.start_time.toISOString(),
          end_time: booking.end_time.toISOString(),
        }),
      });

      if (res.status === 409) {
        toast.error("This slot was just booked by someone else. Refreshing...");
        fetchBookings();
        return false;
      }
      if (!res.ok) throw new Error("create failed");

      const data: Booking = await res.json();
      setBookings((prev) =>
        [...prev, data].sort(
          (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        )
      );
      toast.success("Booking created!");
      return true;
    } catch {
      toast.error("Failed to create booking");
      fetchBookings();
      return false;
    }
  };

  const deleteBooking = async (id: string) => {
    const prev = bookings;
    setBookings((b) => b.filter((x) => x.id !== id));

    try {
      const res = await fetch(`/api/bookings/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Booking deleted");
    } catch {
      toast.error("Failed to delete booking");
      setBookings(prev);
    }
  };

  const updateBooking = async (
    id: string,
    start_time: Date,
    end_time: Date,
    name?: string
  ): Promise<boolean> => {
    const newRange = { start: start_time, end: end_time };
    const overlap = bookings.find(
      (b) =>
        b.id !== id &&
        doRangesOverlap(newRange, {
          start: new Date(b.start_time),
          end: new Date(b.end_time),
        })
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
            ? { ...b, start_time: start_time.toISOString(), end_time: end_time.toISOString(), ...(name !== undefined ? { name } : {}) }
            : b
        )
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    );

    try {
      const fields: Record<string, string> = {
        start_time: start_time.toISOString(),
        end_time: end_time.toISOString(),
      };
      if (name !== undefined) fields.name = name;

      const res = await fetch(`/api/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });

      if (res.status === 409) {
        toast.error("This slot conflicts with another booking.");
        setBookings(prev);
        return false;
      }
      if (!res.ok) throw new Error();

      toast.success("Booking updated!");
      return true;
    } catch {
      toast.error("Failed to update booking");
      setBookings(prev);
      return false;
    }
  };

  return { bookings, loading, createBooking, deleteBooking, updateBooking, refetch: fetchBookings };
}
