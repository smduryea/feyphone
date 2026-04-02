"use client";

import { useState, useMemo } from "react";
import { getWeekBounds, addWeeks, formatWeekLabel } from "@/lib/dateUtils";

export function useWeekNavigation() {
  const [weekOffset, setWeekOffset] = useState(0);

  const { start: weekStart, end: weekEnd } = useMemo(() => {
    const ref = addWeeks(new Date(), weekOffset);
    return getWeekBounds(ref);
  }, [weekOffset]);

  const weekLabel = useMemo(() => formatWeekLabel(weekStart, weekEnd), [weekStart, weekEnd]);

  return {
    weekStart,
    weekEnd,
    weekLabel,
    goNextWeek: () => setWeekOffset((o) => o + 1),
    goPrevWeek: () => setWeekOffset((o) => Math.max(o - 1, 0)),
    goToday: () => setWeekOffset(0),
    isCurrentWeek: weekOffset === 0,
  };
}
