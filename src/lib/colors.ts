export type BookingPalette = typeof PALETTES[number];

const PALETTES = [
  { bg: "bg-lime-300", text: "text-lime-900", border: "border-lime-600", sub: "text-lime-700", hover: "hover:bg-lime-400", active: "active:bg-lime-400", ring: "ring-lime-400" },
  { bg: "bg-fuchsia-400", text: "text-fuchsia-950", border: "border-fuchsia-700", sub: "text-fuchsia-800", hover: "hover:bg-fuchsia-500", active: "active:bg-fuchsia-500", ring: "ring-fuchsia-400" },
  { bg: "bg-cyan-300", text: "text-cyan-900", border: "border-cyan-600", sub: "text-cyan-700", hover: "hover:bg-cyan-400", active: "active:bg-cyan-400", ring: "ring-cyan-400" },
  { bg: "bg-orange-400", text: "text-orange-950", border: "border-orange-700", sub: "text-orange-800", hover: "hover:bg-orange-500", active: "active:bg-orange-500", ring: "ring-orange-400" },
  { bg: "bg-violet-400", text: "text-violet-950", border: "border-violet-700", sub: "text-violet-800", hover: "hover:bg-violet-500", active: "active:bg-violet-500", ring: "ring-violet-400" },
  { bg: "bg-yellow-300", text: "text-yellow-900", border: "border-yellow-600", sub: "text-yellow-700", hover: "hover:bg-yellow-400", active: "active:bg-yellow-400", ring: "ring-yellow-400" },
  { bg: "bg-rose-400", text: "text-rose-950", border: "border-rose-700", sub: "text-rose-800", hover: "hover:bg-rose-500", active: "active:bg-rose-500", ring: "ring-rose-400" },
  { bg: "bg-emerald-300", text: "text-emerald-900", border: "border-emerald-600", sub: "text-emerald-700", hover: "hover:bg-emerald-400", active: "active:bg-emerald-400", ring: "ring-emerald-400" },
  { bg: "bg-sky-300", text: "text-sky-900", border: "border-sky-600", sub: "text-sky-700", hover: "hover:bg-sky-400", active: "active:bg-sky-400", ring: "ring-sky-400" },
  { bg: "bg-pink-300", text: "text-pink-900", border: "border-pink-600", sub: "text-pink-700", hover: "hover:bg-pink-400", active: "active:bg-pink-400", ring: "ring-pink-400" },
];

const FALLBACK = PALETTES[0];

// Build a map of unique names → colors, guaranteed no two names share a color (up to 10 unique names)
export function buildColorMap(names: string[]): Record<string, BookingPalette> {
  const unique = [...new Set(names.map((n) => n.toLowerCase()))];
  const map: Record<string, BookingPalette> = {};
  unique.forEach((name, i) => {
    map[name] = PALETTES[i % PALETTES.length];
  });
  return map;
}

export function getBookingColor(name: string, colorMap?: Record<string, BookingPalette>): BookingPalette {
  return colorMap?.[name.toLowerCase()] ?? FALLBACK;
}
