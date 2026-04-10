"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { Booking } from "@/lib/types";
import {
  isSameDay,
  isToday,
  isPastDay,
  minutesToTimeSlot,
  minutesSinceMidnight,
  getEarliestBookableMinutes,
} from "@/lib/dateUtils";
import { BookingBlock, HOUR_HEIGHT } from "./BookingBlock";
import SunCalc from "suncalc";

// Paris coordinates
const PARIS_LAT = 48.8566;
const PARIS_LNG = 2.3522;

interface DayColumnProps {
  date: Date;
  bookings: Booking[];
  colorMap: Record<string, import("@/lib/colors").BookingPalette>;
  onTimeRangeSelect: (date: Date, startTime: string, endTime: string) => void;
  onDelete: (id: string) => void;
  onEditBooking: (booking: Booking) => void;
  onBookingDragStart: (bookingId: string, durationMin: number, offsetMin: number) => void;
  draggingBookingId?: string | null;
  isMobile?: boolean;
  hideHeader?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const QUARTER_HEIGHT = HOUR_HEIGHT / 4;
const MAX_DURATION_MIN = 4 * 60;

function yToMinutes(y: number): number {
  return Math.round(((y / HOUR_HEIGHT) * 60) / 15) * 15;
}

function formatSlotLabel(slot: string): string {
  return slot;
}

function CurrentTimeLine() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const min = now.getHours() * 60 + now.getMinutes();
  const top = (min / 60) * HOUR_HEIGHT;
  return (
    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: `${top}px` }}>
      <div className="flex items-center">
        <div className="w-3 h-3 bg-red-500 -ml-1.5 rotate-45" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
        <div className="flex-1 h-[2px] bg-red-500" style={{ backgroundImage: "repeating-linear-gradient(90deg, #ef4444 0, #ef4444 6px, transparent 6px, transparent 10px)" }} />
      </div>
    </div>
  );
}

export function DayColumn({
  date,
  bookings,
  colorMap,
  onTimeRangeSelect,
  onDelete,
  onEditBooking,
  onBookingDragStart,
  draggingBookingId,
  isMobile,
  hideHeader,
}: DayColumnProps) {
  const dayBookings = bookings.filter((b) => isSameDay(new Date(b.start_time), date));
  const today = isToday(date);
  const past = isPastDay(date);

  const { sunriseHour, sunsetHour } = useMemo(() => {
    const times = SunCalc.getTimes(date, PARIS_LAT, PARIS_LNG);
    return {
      sunriseHour: times.sunrise.getHours(),
      sunsetHour: times.sunset.getHours(),
    };
  }, [date]);
  const timelineRef = useRef<HTMLDivElement>(null);
  const touchMovedRef = useRef(false);

  const getMinutesFromClientY = useCallback((clientY: number) => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    return yToMinutes(Math.max(0, Math.min(clientY - rect.top, rect.height)));
  }, []);

  const handleMobileTap = useCallback(
    (e: React.MouseEvent) => {
      if (!isMobile || past) return;
      if (touchMovedRef.current) return;
      if ((e.target as HTMLElement).closest("[data-booking]")) return;
      const minutes = getMinutesFromClientY(e.clientY);
      if (isToday(date) && minutes < getEarliestBookableMinutes()) return;
      onTimeRangeSelect(date, minutesToTimeSlot(minutes), minutesToTimeSlot(Math.min(minutes + 60, 24 * 60)));
    },
    [isMobile, past, date, getMinutesFromClientY, onTimeRangeSelect]
  );

  // Desktop: selection drag + booking click-vs-drag detection
  const [selectDragging, setSelectDragging] = useState(false);
  const [dragStartMin, setDragStartMin] = useState(0);
  const [dragCurrentMin, setDragCurrentMin] = useState(0);
  const dragStartRef = useRef(0);

  // Track pending booking mousedown to distinguish click from drag
  const pendingBookingRef = useRef<{ id: string; booking: Booking; startX: number; startY: number; clickMin: number; offsetMin: number; durationMin: number } | null>(null);
  const [pendingBooking, setPendingBooking] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile || past) return;
      if ((e.target as HTMLElement).closest("[data-delete-btn]")) return;

      // Booking: start pending — don't drag yet, wait for movement
      const bookingEl = (e.target as HTMLElement).closest("[data-booking-id]");
      if (bookingEl) {
        e.preventDefault();
        const id = bookingEl.getAttribute("data-booking-id")!;
        const b = dayBookings.find((x) => x.id === id);
        if (!b) return;
        const clickMin = getMinutesFromClientY(e.clientY);
        const s = minutesSinceMidnight(b.start_time);
        const en = minutesSinceMidnight(b.end_time);
        pendingBookingRef.current = { id, booking: b, startX: e.clientX, startY: e.clientY, clickMin, offsetMin: clickMin - s, durationMin: en - s };
        setPendingBooking(true);
        return;
      }

      // Selection drag (stays local)
      e.preventDefault();
      const m = getMinutesFromClientY(e.clientY);
      if (isToday(date) && m < getEarliestBookableMinutes()) return;
      setSelectDragging(true);
      setDragStartMin(m);
      setDragCurrentMin(m);
      dragStartRef.current = m;
    },
    [isMobile, past, getMinutesFromClientY, dayBookings]
  );

  // Pending booking: detect click vs drag
  useEffect(() => {
    if (!pendingBooking) return;
    const DRAG_THRESHOLD = 5; // px

    const onMove = (e: MouseEvent) => {
      const ref = pendingBookingRef.current;
      if (!ref) return;
      const dx = Math.abs(e.clientX - ref.startX);
      const dy = Math.abs(e.clientY - ref.startY);
      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
        // Exceeded threshold → start real drag
        setPendingBooking(false);
        pendingBookingRef.current = null;
        onBookingDragStart(ref.id, ref.durationMin, ref.offsetMin);
      }
    };

    const onUp = () => {
      const ref = pendingBookingRef.current;
      setPendingBooking(false);
      pendingBookingRef.current = null;
      if (ref) {
        // No significant movement → treat as click → edit
        onEditBooking(ref.booking);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [pendingBooking, onBookingDragStart, onEditBooking]);

  useEffect(() => {
    if (!selectDragging) return;
    const clamp = (m: number) => { const a = dragStartRef.current; return m >= a ? Math.min(m, a + MAX_DURATION_MIN) : Math.max(m, a - MAX_DURATION_MIN); };
    const onMove = (e: MouseEvent) => setDragCurrentMin(clamp(getMinutesFromClientY(e.clientY)));
    const onUp = (e: MouseEvent) => {
      setSelectDragging(false);
      const end = clamp(getMinutesFromClientY(e.clientY));
      let s = Math.min(dragStartRef.current, end), en = Math.max(dragStartRef.current, end);
      if (isToday(date)) s = Math.max(s, getEarliestBookableMinutes());
      const fe = en === s ? Math.min(s + 15, 24 * 60) : en;
      const ss = minutesToTimeSlot(s), es = minutesToTimeSlot(fe);
      if (ss !== es) onTimeRangeSelect(date, ss, es);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [selectDragging, date, getMinutesFromClientY, onTimeRangeSelect]);

  const selTop = Math.min(dragStartMin, dragCurrentMin);
  const selBot = Math.max(dragStartMin, dragCurrentMin);
  const selTopPx = (selTop / 60) * HOUR_HEIGHT;
  const selHPx = Math.max(((selBot - selTop) / 60) * HOUR_HEIGHT, QUARTER_HEIGHT);

  const weekday = date.toLocaleDateString([], { weekday: "short" }).toUpperCase();
  const dayNum = date.getDate();

  return (
    <div className={`flex flex-col ${isMobile ? "" : "min-w-[120px]"} ${past ? "opacity-30" : ""}`} data-day-column data-day-date={date.toISOString()}>
      {!hideHeader && (
        <div
          className={`sticky top-0 z-10 border-b-2 border-gray-900 px-2 py-2 text-center font-mono transition-colors ${
            past
              ? "bg-gray-100 text-gray-500"
              : today
                ? "bg-gray-900 text-amber-50"
                : "bg-white text-gray-900"
          }`}
        >
          <div className="text-[10px] font-bold tracking-[0.15em]">{weekday}</div>
          <div className="text-xl font-black leading-none">{dayNum}</div>
        </div>
      )}
      <div
        ref={timelineRef}
        data-timeline
        className={`relative ${past ? "stripes cursor-not-allowed" : isMobile ? "bg-white" : "select-none cursor-crosshair bg-white"}`}
        style={{ height: `${24 * HOUR_HEIGHT}px` }}
        onMouseDown={isMobile ? undefined : handleMouseDown}
        onClick={isMobile ? handleMobileTap : undefined}
        onTouchStart={isMobile ? () => { touchMovedRef.current = false; } : undefined}
        onTouchMove={isMobile ? () => { touchMovedRef.current = true; } : undefined}
      >
        {HOURS.map((hour) => {
          const isSunrise = hour === sunriseHour;
          const isSunset = hour === sunsetHour;
          const distFromSunrise = hour - sunriseHour;
          const distFromSunset = hour - sunsetHour;

          let bgClass = "";
          if (distFromSunrise === -1) {
            bgClass = "bg-gradient-to-b from-indigo-50/40 to-amber-100/40";
          } else if (isSunrise) {
            bgClass = "bg-gradient-to-b from-amber-100/50 to-amber-50/30";
          } else if (distFromSunrise === 1) {
            bgClass = "bg-amber-50/20";
          } else if (distFromSunset === -1) {
            bgClass = "bg-gradient-to-b from-amber-50/20 to-orange-50/30";
          } else if (isSunset) {
            bgClass = "bg-gradient-to-b from-orange-50/40 to-indigo-50/40";
          } else if (distFromSunset === 1) {
            bgClass = "bg-indigo-50/40";
          } else if (hour > sunriseHour && hour < sunsetHour) {
            bgClass = "bg-amber-50/15";
          } else {
            bgClass = "bg-indigo-50/40";
          }

          return (
            <div
              key={hour}
              className={`absolute left-0 right-0 border-b border-gray-200 ${bgClass}`}
              style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
            >
              <span className={`absolute top-0 font-mono font-bold select-none text-gray-500 ${hour % 6 === 0 ? "text-[11px]" : "text-[10px]"} ${isMobile ? "left-2" : "left-1"}`}>
                {String(hour).padStart(2, "0")}:00{isSunrise ? " ☀" : isSunset ? " ☽" : ""}
              </span>
            </div>
          );
        })}

        {today && !past && <CurrentTimeLine />}

        {selectDragging && (
          <div
            className="absolute left-0.5 right-0.5 border-2 border-dashed border-gray-900 bg-lime-200/90 pointer-events-none z-10"
            style={{ top: `${selTopPx}px`, height: `${selHPx}px` }}
          >
            <span className="absolute top-0.5 left-1.5 font-mono text-[10px] font-bold text-gray-900">
              {formatSlotLabel(minutesToTimeSlot(selTop))} – {formatSlotLabel(minutesToTimeSlot(selBot))}
            </span>
          </div>
        )}

        {dayBookings.map((booking) => (
          <BookingBlock
            key={booking.id}
            booking={booking}
            colorMap={colorMap}
            onDelete={onDelete}
            onEdit={onEditBooking}
            isMobile={isMobile}
            isDragging={false}
            isHidden={draggingBookingId === booking.id}
          />
        ))}
      </div>
    </div>
  );
}
