"use client";

import { Booking } from "@/lib/types";
import { formatTime, minutesSinceMidnight } from "@/lib/dateUtils";
import { getBookingColor } from "@/lib/colors";

interface BookingBlockProps {
  booking: Booking;
  colorMap: Record<string, import("@/lib/colors").BookingPalette>;
  onDelete: (id: string) => void;
  onEdit: (booking: Booking) => void;
  isMobile?: boolean;
  isDragging?: boolean;
  isHidden?: boolean;
  dragTopPx?: number;
  dragLabel?: string;
  topOverride?: number;
  heightOverride?: number;
}

const HOUR_HEIGHT = 48;

export function BookingBlock({ booking, colorMap, onDelete, onEdit, isMobile, isDragging, isHidden, dragTopPx, dragLabel, topOverride, heightOverride }: BookingBlockProps) {
  const startMin = minutesSinceMidnight(booking.start_time);
  const endMin = minutesSinceMidnight(booking.end_time);
  const naturalTop = topOverride !== undefined ? topOverride : (startMin / 60) * HOUR_HEIGHT;
  const height = heightOverride !== undefined ? heightOverride : Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 24);
  const top = isDragging && dragTopPx !== undefined ? dragTopPx : naturalTop;
  const color = getBookingColor(booking.name, colorMap);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete ${booking.name}'s booking?`)) {
      onDelete(booking.id);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDragging || isHidden) return;
    onEdit(booking);
  };

  return (
    <div
      data-booking
      data-booking-id={booking.id}
      className={`absolute left-1.5 right-1 border-l-4 px-2.5 py-1 overflow-hidden group z-20 transition-all duration-100 ${color.bg} ${color.border} ${color.text} ${
        isHidden
          ? "opacity-20 pointer-events-none"
          : isDragging
            ? `ring-2 ${color.ring} cursor-grabbing opacity-90 -rotate-1 scale-[1.03]`
            : isMobile
              ? `${color.active} cursor-pointer`
              : `${color.hover} cursor-grab hover:-translate-y-px`
      }`}
      style={{ top: `${top}px`, height: `${height}px` }}
      title={`${booking.name}: ${formatTime(booking.start_time)} – ${formatTime(booking.end_time)}`}
      onClick={handleClick}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="font-bold text-xs truncate leading-tight">{booking.name}</div>
          <div className={`${color.sub} font-mono text-[10px] mt-0.5`}>
            {isDragging && dragLabel
              ? dragLabel
              : `${formatTime(booking.start_time)} – ${formatTime(booking.end_time)}`}
          </div>
        </div>
        {!isDragging && !isMobile && (
          <button
            onClick={handleDelete}
            data-delete-btn
            className="opacity-0 group-hover:opacity-100 shrink-0 h-7 w-7 -mt-0.5 -mr-2 flex items-center justify-center group-hover:bg-black/10 hover:!bg-black/20 transition-all"
            aria-label="Delete booking"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export { HOUR_HEIGHT };
