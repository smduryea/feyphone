"use client";

import { useState, useEffect } from "react";
import { TimeSlotPicker } from "./TimeSlotPicker";
import { combineDateAndTime, isPastDay, minutesSinceMidnight, minutesToTimeSlot, getMinTimeForDate, GRACE_MINUTES } from "@/lib/dateUtils";
import { Booking } from "@/lib/types";

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (booking: { name: string; start_time: Date; end_time: Date }) => Promise<boolean>;
  onEdit: (id: string, booking: { name: string; start_time: Date; end_time: Date }) => Promise<boolean>;
  onDelete: (id: string) => void;
  editingBooking?: Booking | null;
  selectedDate: Date | null;
  initialStartTime?: string;
  initialEndTime?: string;
  weekDays: Date[];
  isMobile: boolean;
}

function addMinutesToSlot(slot: string, minutes: number): string | null {
  const [h, m] = slot.split(":").map(Number);
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Outer: gates rendering so inner always mounts fresh via key
export function BookingModal(props: BookingModalProps) {
  if (!props.isOpen) return null;
  const key = props.editingBooking?.id
    ?? `new-${props.selectedDate?.toISOString() ?? ""}-${props.initialStartTime ?? ""}`;
  return <BookingModalInner key={key} {...props} />;
}

function BookingModalInner({
  onClose, onSubmit, onEdit, onDelete, editingBooking, selectedDate, initialStartTime, initialEndTime, weekDays, isMobile,
}: BookingModalProps) {
  const initialDateIndex = (() => {
    if (editingBooking) {
      const bookingDate = new Date(editingBooking.start_time);
      const idx = weekDays.findIndex((d) => d.toDateString() === bookingDate.toDateString());
      return idx >= 0 ? idx : 0;
    }
    if (selectedDate) {
      const idx = weekDays.findIndex((d) => d.toDateString() === selectedDate.toDateString());
      return idx >= 0 ? idx : 0;
    }
    const first = weekDays.findIndex((d) => !isPastDay(d));
    return first >= 0 ? first : 0;
  })();

  const [name, setName] = useState(editingBooking?.name ?? "");
  const [dateIndex, setDateIndex] = useState(initialDateIndex);
  const [startTime, setStartTime] = useState(
    editingBooking
      ? minutesToTimeSlot(minutesSinceMidnight(editingBooking.start_time))
      : (initialStartTime ?? "")
  );
  const [endTime, setEndTime] = useState(
    editingBooking
      ? minutesToTimeSlot(minutesSinceMidnight(editingBooking.end_time))
      : (initialEndTime ?? "")
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isEditing = !!editingBooking;

  // Escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const maxEndTime = startTime ? addMinutesToSlot(startTime, 4 * 60) : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("enter your name"); return; }
    if (!startTime || !endTime) { setError("pick start & end times"); return; }
    const d = weekDays[dateIndex];
    const start = combineDateAndTime(d, startTime);
    const end = combineDateAndTime(d, endTime);
    if (end <= start) { setError("end must be after start"); return; }
    if (end.getTime() - start.getTime() > 4 * 60 * 60 * 1000) { setError("4 hour max"); return; }
    const graceMs = GRACE_MINUTES * 60 * 1000;
    if (start.getTime() < Date.now() - graceMs) { setError("can't book more than 15 minutes in the past"); return; }
    setSubmitting(true);

    let ok: boolean;
    if (isEditing) {
      ok = await onEdit(editingBooking!.id, { name: name.trim(), start_time: start, end_time: end });
    } else {
      ok = await onSubmit({ name: name.trim(), start_time: start, end_time: end });
    }

    setSubmitting(false);
    if (ok) onClose();
  };

  const handleDelete = () => {
    if (!editingBooking) return;
    if (window.confirm(`Delete ${editingBooking.name}'s booking?`)) {
      onDelete(editingBooking.id);
      onClose();
    }
  };

  const title = isEditing ? "Edit Booking" : "Make Booking";
  const submitLabel = isEditing
    ? submitting ? "saving..." : "Save Changes"
    : submitting ? "booking..." : "Make Booking";

  const inputClass =
    "border-2 border-gray-900 bg-white px-4 py-3 text-base font-mono focus:bg-lime-50 focus:outline-none transition-colors placeholder:text-gray-300";

  const formContent = (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="font-mono text-[10px] uppercase tracking-[0.15em] font-bold text-gray-500">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="who are you?"
          className={inputClass}
          autoFocus={!isMobile}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-mono text-[10px] uppercase tracking-[0.15em] font-bold text-gray-500">Date</label>
        <select value={dateIndex} onChange={(e) => {
          const idx = Number(e.target.value);
          setDateIndex(idx);
          const minTime = getMinTimeForDate(weekDays[idx]);
          if (minTime && startTime && startTime < minTime) { setStartTime(""); setEndTime(""); }
        }} className={inputClass}>
          {weekDays.map((d, i) => (
            <option key={i} value={i} disabled={isPastDay(d)}>
              {d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
              {isPastDay(d) ? " (past)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <TimeSlotPicker
          label="Start"
          value={startTime}
          onChange={(v) => {
            if (startTime && endTime) {
              const [sh, sm] = startTime.split(":").map(Number);
              const [eh, em] = endTime.split(":").map(Number);
              const duration = (eh * 60 + em) - (sh * 60 + sm);
              const newEnd = addMinutesToSlot(v, duration);
              setStartTime(v);
              setEndTime(newEnd ?? "");
            } else {
              setStartTime(v);
              setEndTime(addMinutesToSlot(v, 30) ?? "");
            }
          }}
          minTime={getMinTimeForDate(weekDays[dateIndex])}
        />
        <TimeSlotPicker
          label="End"
          value={endTime}
          onChange={setEndTime}
          minTime={startTime || undefined}
          maxTime={maxEndTime || undefined}
        />
      </div>

      {startTime && endTime && (
        <div className="border-2 border-dashed border-gray-300 px-4 py-2 font-mono text-sm">
          <span className="text-gray-600">duration: </span>
          <span className="font-bold text-gray-900">
            {(() => {
              const [sh, sm] = startTime.split(":").map(Number);
              const [eh, em] = endTime.split(":").map(Number);
              const mins = eh * 60 + em - (sh * 60 + sm);
              const h = Math.floor(mins / 60), m = mins % 60;
              return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
            })()}
          </span>
        </div>
      )}

      {error && (
        <div className="border-2 border-red-500 bg-red-50 px-4 py-2 font-mono text-sm text-red-700 font-bold">
          {error}
        </div>
      )}

      <div className={`flex gap-2 mt-2 ${isMobile ? "flex-col-reverse" : isEditing ? "justify-between" : "justify-end"}`}>
        {isEditing && (
          <button
            type="button"
            onClick={handleDelete}
            className={`border-2 border-red-500 text-red-700 px-5 py-3 font-mono text-sm font-bold uppercase tracking-wider hover:bg-red-50 transition-colors active:translate-y-0.5 ${isMobile ? "w-full" : ""}`}
          >
            Delete
          </button>
        )}

        <div className={`flex gap-2 ${isMobile ? "flex-col-reverse w-full" : ""}`}>
          <button
            type="button"
            onClick={onClose}
            className={`border-2 border-gray-900 px-5 py-3 font-mono text-sm font-bold uppercase tracking-wider hover:bg-gray-100 transition-colors active:translate-y-0.5 ${isMobile ? "w-full" : ""}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={`border-2 border-gray-900 bg-fuchsia-400 px-5 py-3 font-mono text-sm font-bold uppercase tracking-wider text-fuchsia-950 hover:bg-fuchsia-500 disabled:opacity-50 transition-colors active:translate-y-0.5 ${isMobile ? "w-full" : ""}`}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex items-end animate-fade-in" onClick={onClose}>
        <div className="absolute inset-0 bg-black/40" />
        <div
          className="relative w-full border-t-4 border-gray-900 bg-amber-50 px-4 pb-8 pt-5 animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto mb-4 h-1 w-12 bg-gray-300" />
          <h3 className="text-2xl font-black tracking-tight text-gray-900 mb-5">{title}</h3>
          {formContent}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-md border-4 border-gray-900 bg-amber-50 p-7 animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-lime-300 border-2 border-gray-900" />
        <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-fuchsia-400 border-2 border-gray-900 rotate-45" />

        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-black tracking-tight text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center border-2 border-gray-900 hover:bg-gray-900 hover:text-amber-50 transition-colors text-xl font-bold leading-none"
          >
            &times;
          </button>
        </div>
        {formContent}
      </div>
    </div>
  );
}
