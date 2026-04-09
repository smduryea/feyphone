"use client";

import { generateTimeSlots } from "@/lib/dateUtils";

const TIME_SLOTS = generateTimeSlots();

interface TimeSlotPickerProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  minTime?: string;
  maxTime?: string;
}

export function TimeSlotPicker({ label, value, onChange, minTime, maxTime }: TimeSlotPickerProps) {
  const filtered = TIME_SLOTS.filter((slot) => {
    if (minTime && slot <= minTime) return false;
    if (maxTime && slot > maxTime) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-1">
      <label className="font-mono text-[10px] uppercase tracking-[0.15em] font-bold text-gray-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-2 border-gray-900 bg-white px-3 py-3 font-mono text-base focus:bg-lime-50 focus:outline-none transition-colors"
      >
        <option value="">--:--</option>
        {filtered.map((slot) => (
          <option key={slot} value={slot}>
            {formatSlot(slot)}
          </option>
        ))}
      </select>
    </div>
  );
}

function formatSlot(slot: string): string {
  return slot;
}
