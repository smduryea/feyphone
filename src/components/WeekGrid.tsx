"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Booking } from "@/lib/types";
import {
  getDaysOfWeek,
  isToday,
  isPastDay,
  isSameDay,
  minutesToTimeSlot,
  minutesSinceMidnight,
  combineDateAndTime,
} from "@/lib/dateUtils";
import { getBookingColor } from "@/lib/colors";
import { DayColumn } from "./DayColumn";
import { HOUR_HEIGHT } from "./BookingBlock";

interface WeekGridProps {
  weekStart: Date;
  bookings: Booking[];
  colorMap: Record<string, import("@/lib/colors").BookingPalette>;
  onTimeRangeSelect: (date: Date, startTime: string, endTime: string) => void;
  onDelete: (id: string) => void;
  onEditBooking: (booking: Booking) => void;
  onMoveBooking: (id: string, newStart: Date, newEnd: Date) => Promise<boolean>;
  isMobile: boolean;
}

interface MoveState {
  bookingId: string;
  booking: Booking;
  durationMin: number;
  offsetMin: number;
  currentDayIndex: number;
  currentTopMin: number;
}

function formatSlotLabel(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

export function WeekGrid({
  weekStart,
  bookings,
  colorMap,
  onTimeRangeSelect,
  onDelete,
  onEditBooking,
  onMoveBooking,
  isMobile,
}: WeekGridProps) {
  const days = getDaysOfWeek(weekStart);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const tabsRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Cross-day move drag state
  const [moveState, setMoveState] = useState<MoveState | null>(null);
  const moveRef = useRef<MoveState | null>(null);

  useEffect(() => { setSelectedDayIndex(0); }, [weekStart]);

  useEffect(() => {
    if (!isMobile || !tabsRef.current) return;
    const tab = tabsRef.current.children[selectedDayIndex] as HTMLElement;
    if (tab) tab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [selectedDayIndex, isMobile]);

  // Called by DayColumn when a booking drag starts
  const handleBookingDragStart = useCallback(
    (bookingId: string, durationMin: number, offsetMin: number) => {
      const booking = bookings.find((b) => b.id === bookingId);
      if (!booking) return;
      const startDayIndex = days.findIndex((d) => isSameDay(new Date(booking.start_time), d));
      const startMin = minutesSinceMidnight(booking.start_time);
      const state: MoveState = {
        bookingId,
        booking,
        durationMin,
        offsetMin,
        currentDayIndex: startDayIndex >= 0 ? startDayIndex : 0,
        currentTopMin: startMin,
      };
      setMoveState(state);
      moveRef.current = state;
    },
    [bookings, days]
  );

  // Resolve cursor position to dayIndex + minutes
  const resolvePosition = useCallback(
    (clientX: number, clientY: number) => {
      if (!gridRef.current) return null;
      const columns = gridRef.current.querySelectorAll("[data-timeline]");
      let dayIndex = -1;
      let minutes = 0;

      for (let i = 0; i < columns.length; i++) {
        const rect = columns[i].getBoundingClientRect();
        if (clientX >= rect.left && clientX < rect.right) {
          dayIndex = i;
          const y = Math.max(0, Math.min(clientY - rect.top, rect.height));
          minutes = Math.round(((y / HOUR_HEIGHT) * 60) / 15) * 15;
          break;
        }
      }

      // If cursor is left of first column or right of last, clamp to edges
      if (dayIndex === -1 && columns.length > 0) {
        const firstRect = columns[0].getBoundingClientRect();
        const lastRect = columns[columns.length - 1].getBoundingClientRect();
        if (clientX < firstRect.left) {
          dayIndex = 0;
        } else if (clientX >= lastRect.right) {
          dayIndex = columns.length - 1;
        }
        if (dayIndex >= 0) {
          const rect = columns[dayIndex].getBoundingClientRect();
          const y = Math.max(0, Math.min(clientY - rect.top, rect.height));
          minutes = Math.round(((y / HOUR_HEIGHT) * 60) / 15) * 15;
        }
      }

      return dayIndex >= 0 ? { dayIndex, minutes } : null;
    },
    []
  );

  // Window mousemove/mouseup for cross-day dragging
  useEffect(() => {
    if (!moveState) return;
    const ref = moveRef.current;
    if (!ref) return;

    const onMove = (e: MouseEvent) => {
      const pos = resolvePosition(e.clientX, e.clientY);
      if (!pos) return;
      let topMin = pos.minutes - ref.offsetMin;
      topMin = Math.max(0, Math.min(topMin, 24 * 60 - ref.durationMin));
      topMin = Math.round(topMin / 15) * 15;
      const updated = { ...ref, currentDayIndex: pos.dayIndex, currentTopMin: topMin };
      moveRef.current = updated;
      setMoveState(updated);
    };

    const onUp = (e: MouseEvent) => {
      const cur = moveRef.current;
      if (!cur) return;
      const pos = resolvePosition(e.clientX, e.clientY);

      setMoveState(null);
      moveRef.current = null;

      if (!pos) return;
      let topMin = pos.minutes - cur.offsetMin;
      topMin = Math.max(0, Math.min(topMin, 24 * 60 - cur.durationMin));
      topMin = Math.round(topMin / 15) * 15;

      const targetDate = days[pos.dayIndex];
      if (!targetDate || isPastDay(targetDate)) return;

      const newStart = combineDateAndTime(targetDate, minutesToTimeSlot(topMin));
      const newEnd = combineDateAndTime(targetDate, minutesToTimeSlot(topMin + cur.durationMin));
      onMoveBooking(cur.bookingId, newStart, newEnd);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [moveState, days, resolvePosition, onMoveBooking]);

  // Ghost block rendering info
  const ghostInfo = moveState
    ? (() => {
        const color = getBookingColor(moveState.booking.name, colorMap);
        const topPx = (moveState.currentTopMin / 60) * HOUR_HEIGHT;
        const heightPx = Math.max((moveState.durationMin / 60) * HOUR_HEIGHT, 24);
        const startLabel = formatSlotLabel(minutesToTimeSlot(moveState.currentTopMin));
        const endLabel = formatSlotLabel(minutesToTimeSlot(moveState.currentTopMin + moveState.durationMin));
        return { color, topPx, heightPx, startLabel, endLabel, dayIndex: moveState.currentDayIndex, name: moveState.booking.name };
      })()
    : null;

  // No-op for mobile drag start
  const noopDragStart = useCallback(() => {}, []);

  if (isMobile) {
    const selectedDate = days[selectedDayIndex];
    const dayBookings = bookings.filter((b) => isSameDay(new Date(b.start_time), selectedDate));

    return (
      <div className="flex flex-col gap-3">
        <div ref={tabsRef} className="flex gap-1 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
          {days.map((date, i) => {
            const active = i === selectedDayIndex;
            const todayDate = isToday(date);
            const past = isPastDay(date);
            const dayName = date.toLocaleDateString([], { weekday: "narrow" });
            const dayNum = date.getDate();
            const hasBookings = bookings.some((b) => isSameDay(new Date(b.start_time), date));

            return (
              <button
                key={i}
                onClick={() => setSelectedDayIndex(i)}
                className={`relative flex flex-col items-center shrink-0 px-3 py-2 font-mono transition-all min-w-[48px] border-2 ${
                  active
                    ? "border-gray-900 bg-gray-900 text-amber-50"
                    : past
                      ? "border-gray-200 bg-gray-100 text-gray-500"
                      : todayDate
                        ? "border-gray-900 bg-gray-100 text-gray-900"
                        : "border-gray-300 bg-white text-gray-600 active:bg-gray-100"
                }`}
              >
                <span className="text-[10px] uppercase font-bold">{dayName}</span>
                <span className="text-xl leading-tight font-black">{dayNum}</span>
                {hasBookings && !active && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-0.5 bg-current" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-0.5 font-mono">
          <p className="text-xs font-bold text-gray-900">
            {selectedDate.toLocaleDateString([], { weekday: "long" }).toUpperCase()}
          </p>
          <p className="text-[10px] text-gray-500">
            {dayBookings.length === 0 ? "no bookings yet" : `${dayBookings.length} booked`}
          </p>
        </div>

        <div className="border-2 border-gray-900 bg-white overflow-y-auto overscroll-contain touch-scroll scrollbar-none" style={{ maxHeight: "68vh" }}>
          <DayColumn
            date={selectedDate}
            bookings={bookings}
            colorMap={colorMap}
            onTimeRangeSelect={onTimeRangeSelect}
            onDelete={onDelete}
            onEditBooking={onEditBooking}
            onBookingDragStart={noopDragStart}
            isMobile
            hideHeader
          />
        </div>
      </div>
    );
  }

  // Desktop: 7-column grid with cross-day drag support
  return (
    <div className="border-2 border-gray-900 bg-white overflow-x-auto overflow-y-hidden scrollbar-none relative" ref={gridRef}>
      <div className="grid grid-cols-7 divide-x-2 divide-gray-900 min-w-[840px]">
        {days.map((date, i) => (
          <DayColumn
            key={date.toISOString()}
            date={date}
            bookings={bookings}
            colorMap={colorMap}
            onTimeRangeSelect={onTimeRangeSelect}
            onDelete={onDelete}
            onEditBooking={onEditBooking}
            onBookingDragStart={handleBookingDragStart}
            draggingBookingId={moveState?.bookingId}
          />
        ))}
      </div>

      {/* Ghost booking block overlay */}
      {ghostInfo && gridRef.current && (() => {
        const columns = gridRef.current!.querySelectorAll("[data-timeline]");
        const col = columns[ghostInfo.dayIndex] as HTMLElement | undefined;
        if (!col) return null;
        const gridRect = gridRef.current!.getBoundingClientRect();
        const colRect = col.getBoundingClientRect();
        const left = colRect.left - gridRect.left + gridRef.current!.scrollLeft;
        const width = colRect.width;

        return (
          <div
            className={`absolute border-l-4 px-2.5 py-1 overflow-hidden z-50 pointer-events-none ${ghostInfo.color.bg} ${ghostInfo.color.border} ${ghostInfo.color.text} ring-2 ${ghostInfo.color.ring} -rotate-1 scale-[1.03]`}
            style={{
              top: `${ghostInfo.topPx + col.offsetTop}px`,
              left: `${left + 6}px`,
              width: `${width - 10}px`,
              height: `${ghostInfo.heightPx}px`,
            }}
          >
            <div className="font-bold text-xs truncate leading-tight">{ghostInfo.name}</div>
            {ghostInfo.heightPx >= 36 && (
              <div className={`${ghostInfo.color.sub} font-mono text-[10px] mt-0.5`}>
                {ghostInfo.startLabel} – {ghostInfo.endLabel}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
