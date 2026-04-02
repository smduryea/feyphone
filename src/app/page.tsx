"use client";

import { useState, useMemo } from "react";
import { useWeekNavigation } from "@/hooks/useWeekNavigation";
import { useBookings } from "@/hooks/useBookings";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getDaysOfWeek } from "@/lib/dateUtils";
import { buildColorMap } from "@/lib/colors";
import { Booking } from "@/lib/types";
import { WeekNavigator } from "@/components/WeekNavigator";
import { WeekGrid } from "@/components/WeekGrid";
import { BookingModal } from "@/components/BookingModal";

export default function Home() {
  const isMobile = useIsMobile();
  const { weekStart, weekEnd, weekLabel, goNextWeek, goPrevWeek, goToday, isCurrentWeek } =
    useWeekNavigation();
  const { bookings, loading, createBooking, deleteBooking, updateBooking } = useBookings(weekStart, weekEnd);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [initialStartTime, setInitialStartTime] = useState<string | undefined>();
  const [initialEndTime, setInitialEndTime] = useState<string | undefined>();
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);

  const weekDays = getDaysOfWeek(weekStart);
  const colorMap = useMemo(() => buildColorMap(bookings.map((b) => b.name)), [bookings]);

  const handleTimeRangeSelect = (date: Date, startTime: string, endTime: string) => {
    setEditingBooking(null);
    setSelectedDate(date);
    setInitialStartTime(startTime);
    setInitialEndTime(endTime);
    setModalOpen(true);
  };

  const handleNewBooking = () => {
    setEditingBooking(null);
    setSelectedDate(null);
    setInitialStartTime(undefined);
    setInitialEndTime(undefined);
    setModalOpen(true);
  };

  const handleEditBooking = (booking: Booking) => {
    setEditingBooking(booking);
    setSelectedDate(null);
    setInitialStartTime(undefined);
    setInitialEndTime(undefined);
    setModalOpen(true);
  };

  const handleEditSubmit = async (
    id: string,
    booking: { name: string; start_time: Date; end_time: Date }
  ): Promise<boolean> => {
    return updateBooking(id, booking.start_time, booking.end_time, booking.name);
  };

  return (
    <div className="mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-600 mb-1 sm:text-xs">community resource</p>
            <h1 className="text-3xl font-black tracking-tighter text-gray-900 sm:text-5xl leading-none">
              Phone<br className="sm:hidden" /> Booth
            </h1>
          </div>
          <button
            onClick={handleNewBooking}
            className="shrink-0 border-2 border-gray-900 bg-lime-300 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-gray-900 hover:bg-lime-400 active:translate-y-0.5 transition-all sm:px-6 sm:py-3"
          >
            + Book
          </button>
        </div>
        <div className="h-1 bg-gray-900 w-full" />
      </div>

      {/* Navigation */}
      <div className="mb-5 sm:mb-6">
        <WeekNavigator
          weekLabel={weekLabel}
          isCurrentWeek={isCurrentWeek}
          onPrev={goPrevWeek}
          onNext={goNextWeek}
          onToday={goToday}
        />
      </div>

      {/* Calendar */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="font-mono text-sm text-gray-600 animate-pulse">loading bookings...</div>
        </div>
      ) : (
        <WeekGrid
          weekStart={weekStart}
          bookings={bookings}
          colorMap={colorMap}
          onTimeRangeSelect={handleTimeRangeSelect}
          onDelete={deleteBooking}
          onEditBooking={handleEditBooking}
          onMoveBooking={updateBooking}
          isMobile={isMobile}
        />
      )}

      {/* Bottom hint */}
      <p className="mt-4 font-mono text-[10px] text-gray-500 text-center sm:text-xs">
        {isMobile ? "tap a slot to book ~ tap a booking to edit" : "click or drag to book ~ click a booking to edit ~ drag to move"}
      </p>

      <BookingModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={createBooking}
        onEdit={handleEditSubmit}
        onDelete={deleteBooking}
        editingBooking={editingBooking}
        selectedDate={selectedDate}
        initialStartTime={initialStartTime}
        initialEndTime={initialEndTime}
        weekDays={weekDays}
        isMobile={isMobile}
      />
    </div>
  );
}
