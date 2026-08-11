import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function getYoutubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("?")[0] || null;
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const m = u.pathname.match(/\/embed\/([^\/]+)/);
    if (m) return m[1];
    const m2 = u.pathname.match(/\/shorts\/([^\/]+)/);
    if (m2) return m2[1];
    return null;
  } catch { return null; }
}
export function formatTime(s: number) {
  const m = Math.floor(s/60); const sec = Math.floor(s%60);
  return `${m}:${sec.toString().padStart(2,"0")}`;
}
