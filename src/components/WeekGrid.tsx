"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
  return slot;
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
  // Store weekStart alongside index so we can derive 0 when weekStart changes without an effect
  const [tabState, setTabState] = useState({ weekStart, index: 0 });
  const selectedDayIndex = tabState.weekStart === weekStart ? tabState.index : 0;
  const setSelectedDayIndex = (i: number) => setTabState({ weekStart, index: i });
  const tabsRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Night hours expand/collapse (shared across all columns)
  const [nightExpanded, setNightExpanded] = useState(false);
  const toggleNight = useCallback(() => setNightExpanded(prev => !prev), []);

  // Cross-day move drag state
  const [moveState, setMoveState] = useState<MoveState | null>(null);
  const moveRef = useRef<MoveState | null>(null);

  // Ghost block column geometry — measured in event handlers, not during render
  const [ghostGeom, setGhostGeom] = useState<{ left: number; width: number; offsetTop: number } | null>(null);

  // Constants for collapsed night hours (same as DayColumn)
  const DAY_HOURS_LENGTH = 19; // 6am-11pm + midnight
  const NIGHT_COLLAPSED_HEIGHT = 28;

  // Convert Y position to minutes accounting for collapsed hours
  const getMinutesFromY = useCallback((y: number): number => {
    const dayHoursEnd = 18 * HOUR_HEIGHT; // End of hours 6-23
    const midnightEnd = 19 * HOUR_HEIGHT; // End of midnight hour
    const nightStart = DAY_HOURS_LENGTH * HOUR_HEIGHT;

    if (y < dayHoursEnd) {
      // In day hours (6am-11pm)
      const hour = 6 + Math.floor(y / HOUR_HEIGHT);
      const minutesIntoHour = ((y % HOUR_HEIGHT) / HOUR_HEIGHT) * 60;
      return hour * 60 + minutesIntoHour;
    } else if (y < midnightEnd) {
      // In midnight hour
      const minutesIntoHour = ((y - dayHoursEnd) / HOUR_HEIGHT) * 60;
      return minutesIntoHour; // 0:00 - 0:59
    } else {
      // In night hours (1am-5am)
      const yInNight = y - nightStart;
      if (nightExpanded) {
        const hour = 1 + Math.floor(yInNight / HOUR_HEIGHT);
        const minutesIntoHour = ((yInNight % HOUR_HEIGHT) / HOUR_HEIGHT) * 60;
        return Math.min(hour * 60 + minutesIntoHour, 6 * 60); // Cap at 6am
      } else {
        // Collapsed: map the small region to 1am-5am
        const fraction = Math.min(yInNight / NIGHT_COLLAPSED_HEIGHT, 1);
        const totalNightMinutes = 5 * 60; // 1am-6am = 5 hours
        return 60 + fraction * totalNightMinutes; // Start at 1am (60 min)
      }
    }
  }, [nightExpanded]);

  useEffect(() => {
    if (!isMobile || !tabsRef.current) return;
    const tab = tabsRef.current.children[selectedDayIndex] as HTMLElement;
    if (tab) tab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [selectedDayIndex, isMobile]);

  const measureColumn = useCallback((dayIndex: number) => {
    if (!gridRef.current) return;
    const columns = gridRef.current.querySelectorAll("[data-timeline]");
    const col = columns[dayIndex] as HTMLElement | undefined;
    if (!col) return;
    const gridRect = gridRef.current.getBoundingClientRect();
    const colRect = col.getBoundingClientRect();
    setGhostGeom({
      left: colRect.left - gridRect.left + gridRef.current.scrollLeft,
      width: colRect.width,
      offsetTop: col.offsetTop,
    });
  }, []);

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
      measureColumn(state.currentDayIndex);
    },
    [bookings, days, measureColumn]
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
          minutes = Math.round(getMinutesFromY(y) / 15) * 15;
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
          minutes = Math.round(getMinutesFromY(y) / 15) * 15;
        }
      }

      return dayIndex >= 0 ? { dayIndex, minutes } : null;
    },
    [getMinutesFromY]
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
      measureColumn(pos.dayIndex);
    };

    const onUp = (e: MouseEvent) => {
      const cur = moveRef.current;
      if (!cur) return;
      const pos = resolvePosition(e.clientX, e.clientY);

      setMoveState(null);
      setGhostGeom(null);
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
  }, [moveState, days, resolvePosition, onMoveBooking, measureColumn]);

  // Ghost block rendering info — pure data, no DOM access
  const ghostInfo = useMemo(() => {
    if (!moveState) return null;
    const color = getBookingColor(moveState.booking.name, colorMap);
    const topPx = (moveState.currentTopMin / 60) * HOUR_HEIGHT;
    const heightPx = Math.max((moveState.durationMin / 60) * HOUR_HEIGHT, 24);
    const startLabel = formatSlotLabel(minutesToTimeSlot(moveState.currentTopMin));
    const endLabel = formatSlotLabel(minutesToTimeSlot(moveState.currentTopMin + moveState.durationMin));
    return { color, topPx, heightPx, startLabel, endLabel, dayIndex: moveState.currentDayIndex, name: moveState.booking.name };
  }, [moveState, colorMap]);

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
            nightExpanded={nightExpanded}
            onToggleNight={toggleNight}
          />
        </div>
      </div>
    );
  }

  // Desktop: 7-column grid with cross-day drag support
  return (
    <div className="border-2 border-gray-900 bg-white overflow-x-auto overflow-y-hidden scrollbar-none relative" ref={gridRef}>
      <div className="grid grid-cols-7 divide-x-2 divide-gray-900 min-w-[840px]">
        {days.map((date) => (
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
            nightExpanded={nightExpanded}
            onToggleNight={toggleNight}
          />
        ))}
      </div>

      {/* Ghost booking block overlay — position comes from ghostGeom state, measured in event handlers */}
      {ghostInfo && ghostGeom && (
        <div
          className={`absolute border-l-4 px-2.5 py-1 overflow-hidden z-50 pointer-events-none ${ghostInfo.color.bg} ${ghostInfo.color.border} ${ghostInfo.color.text} ring-2 ${ghostInfo.color.ring} -rotate-1 scale-[1.03]`}
          style={{
            top: `${ghostInfo.topPx + ghostGeom.offsetTop}px`,
            left: `${ghostGeom.left + 6}px`,
            width: `${ghostGeom.width - 10}px`,
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
      )}
    </div>
  );
}
