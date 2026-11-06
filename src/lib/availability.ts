import { fixedBlockError, toMinutes } from './booking';

/** Cột đầu của lưới ứng với 05:00; mỗi cột 30 phút. Trùng `GRID` ở server/src/alobo/layout.ts. */
const FIRST_MINUTE = 300;
const LAST_MINUTE = 1440;
/** Thứ tự ưu tiên khi không chọn sân. Trùng `COURT_PRIORITY` ở server/src/alobo/layout.ts. */
export const COURT_PRIORITY = [4, 5, 6, 7, 8, 9, 3, 2, 1, 10];

const p2 = (n: number) => String(n).padStart(2, '0');
export const toHHMM = (m: number) => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;

/** Các cột của khung [s, e) (phút); rỗng nếu khung nằm ngoài 05:00–24:00 hoặc không dương. */
function columns(s: number, e: number): number[] {
  if (s < FIRST_MINUTE || e > LAST_MINUTE || s >= e) return [];
  const cols: number[] = [];
  for (let m = s; m < e; m += 30) cols.push((m - FIRST_MINUTE) / 30);
  return cols;
}

function courtsFree(free: boolean[][], s: number, e: number): number[] {
  const cols = columns(s, e);
  if (cols.length === 0) return [];
  return COURT_PRIORITY.filter((c) => cols.every((col) => free[c - 1]?.[col] === true));
}

/** Các sân trống trọn khung [start, end), theo thứ tự ưu tiên. */
export function freeCourts(free: boolean[][], start: string, end: string): number[] {
  return courtsFree(free, toMinutes(start), toMinutes(end));
}

export interface NearbySlot {
  start: string;
  end: string;
  courts: number[];
}

/**
 * Khung cùng độ dài lệch ±30/60/90/120 phút còn sân trống (gần trước), bỏ khung vượt 05:00–24:00 hoặc cắt ngang ca 18:00–20:00; tối đa 3.
 * Mốc ±120 để khung đúng ca 18–20 vẫn có gợi ý (16–18, 20–22): mọi khung lệch ít hơn đều cắt ngang ca.
 */
export function nearbySlots(free: boolean[][], start: string, end: string): NearbySlot[] {
  const s = toMinutes(start);
  const e = toMinutes(end);
  const out: NearbySlot[] = [];
  for (const d of [-30, 30, -60, 60, -90, 90, -120, 120]) {
    const ns = toHHMM(s + d);
    const ne = toHHMM(e + d);
    if (s + d < FIRST_MINUTE || e + d > LAST_MINUTE || fixedBlockError(ns, ne)) continue;
    const courts = courtsFree(free, s + d, e + d);
    if (courts.length > 0) out.push({ start: ns, end: ne, courts });
    if (out.length === 3) break;
  }
  return out;
}
