"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Booking } from "@/lib/types";
import { doRangesOverlap } from "@/lib/dateUtils";
import toast from "react-hot-toast";

export function useBookings(weekStart: Date, weekEnd: Date) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef(false);

  const fetchBookings = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .gte("start_time", weekStart.toISOString())
        .lt("start_time", weekEnd.toISOString())
        .order("start_time");

      if (error) {
        toast.error("Failed to load bookings");
        console.error(error);
      } else {
        setBookings(data ?? []);
      }
      setLoading(false);
    },
    [weekStart, weekEnd]
  );

  useEffect(() => {
    // Show spinner only on first load or week change
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

    const { data, error } = await supabase
      .from("bookings")
      .insert({
        name: booking.name,
        start_time: booking.start_time.toISOString(),
        end_time: booking.end_time.toISOString(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23P01") {
        toast.error("This slot was just booked by someone else. Refreshing...");
      } else {
        toast.error(error.message);
      }
      fetchBookings();
      return false;
    }

    // Optimistic: append the new booking locally
    setBookings((prev) =>
      [...prev, data].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      )
    );
    toast.success("Booking created!");
    return true;
  };

  const deleteBooking = async (id: string) => {
    // Optimistic: remove immediately
    const prev = bookings;
    setBookings((b) => b.filter((x) => x.id !== id));

    const { error } = await supabase.from("bookings").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete booking");
      console.error(error);
      setBookings(prev); // revert
    } else {
      toast.success("Booking deleted");
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

    // Optimistic: update locally first
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

    const fields: Record<string, string> = {
      start_time: start_time.toISOString(),
      end_time: end_time.toISOString(),
    };
    if (name !== undefined) fields.name = name;

    const { error } = await supabase
      .from("bookings")
      .update(fields)
      .eq("id", id);

    if (error) {
      if (error.code === "23P01") {
        toast.error("This slot conflicts with another booking.");
      } else {
        toast.error(error.message);
      }
      setBookings(prev); // revert
      return false;
    }

    toast.success("Booking updated!");
    return true;
  };

  return { bookings, loading, createBooking, deleteBooking, updateBooking, refetch: fetchBookings };
}
