"use client";

interface WeekNavigatorProps {
  weekLabel: string;
  isCurrentWeek: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function WeekNavigator({
  weekLabel,
  isCurrentWeek,
  onPrev,
  onNext,
  onToday,
}: WeekNavigatorProps) {
  return (
    <div className="flex items-center justify-between gap-2 sm:justify-start sm:gap-3">
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          disabled={isCurrentWeek}
          className="h-10 w-10 flex items-center justify-center border-2 border-gray-900 font-black text-lg hover:bg-gray-900 hover:text-amber-50 transition-colors disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-current active:translate-y-0.5"
          aria-label="Previous week"
          title={isCurrentWeek ? "You cannot view or adjust bookings in the past" : "Previous week"}
        >
          &larr;
        </button>
        <button
          onClick={onNext}
          className="h-10 w-10 flex items-center justify-center border-2 border-gray-900 font-black text-lg hover:bg-gray-900 hover:text-amber-50 transition-colors active:translate-y-0.5"
          aria-label="Next week"
        >
          &rarr;
        </button>
        {!isCurrentWeek && (
          <button
            onClick={onToday}
            className="h-10 px-4 flex items-center justify-center border-2 border-gray-900 text-sm font-bold uppercase tracking-wide hover:bg-gray-900 hover:text-amber-50 transition-colors active:translate-y-0.5"
          >
            Today
          </button>
        )}
      </div>
      <h2 className="font-mono text-sm font-bold text-gray-600 sm:text-base tracking-tight">{weekLabel}</h2>
    </div>
  );
}
