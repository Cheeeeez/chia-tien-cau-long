// Mọi tọa độ/màu đo ở viewport 1700×1000, deviceScaleFactor 1. Alobo đổi giao diện thì chỉ sửa file này.
export const BRANCH_URL = 'https://datlich.alobo.vn/san/sport_san_cau_long_quoc_hoc_cn2';
export const VIEWPORT = { width: 1700, height: 1000 };
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

export const COURTS = Array.from({ length: 10 }, (_, i) => `C.Lông ${i + 1}`);
/** Thứ tự thử khi không chỉ định sân: 4–9 trước, hết thì 3, 2, 1; sân 10 chỉ là phương án cuối. */
export const COURT_PRIORITY = [4, 5, 6, 7, 8, 9, 3, 2, 1, 10];

export interface Point {
  x: number;
  y: number;
}

export const PT = {
  datLich: { x: 1644, y: 280 },
  card: { x: 850, y: 470 },
  dateButton: { x: 1611, y: 74 },
  nextMonth: { x: 987, y: 342 },
  pickerConfirm: { x: 953, y: 671 },
  tiepTheo: { x: 850, y: 965 },
  summaryProbe: { x: 850, y: 400 },
  nameField: { x: 300, y: 689 },
  phoneField: { x: 498, y: 789 },
  // Đăng nhập: tab "Tài khoản" ở thanh dưới trang sân → hộp thoại "Tạo tài khoản" (OK sang trang Đăng ký) → link "Đăng nhập".
  accountTab: { x: 1416, y: 954 },
  modalOk: { x: 850, y: 535 },
  loginLink: { x: 922, y: 856 },
  loginPhone: { x: 900, y: 318 },
  loginPassword: { x: 824, y: 434 },
  loginButton: { x: 850, y: 521 },
} satisfies Record<string, Point>;

export const COLOR = {
  branchReady: '#e3b02c',
  loginButton: '#006d38',
  dialog: '#ddffda',
  summary: '#005f31',
  free: '#ffffff',
  selected: '#c7eedb',
  background: ['#e6f8ef', '#edfff6'],
};

export const GRID = { left: 60, top: 287, rowH: 40, cols: 38, firstMinute: 300, scanY: 307, minColW: 40, maxColW: 44 };

/** "HH:MM" → số phút từ 00:00. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Các cột 30 phút phủ [start, end). */
export function slotColumns(start: string, end: string): number[] {
  const cols: number[] = [];
  for (let m = toMinutes(start); m < toMinutes(end); m += 30) cols.push((m - GRID.firstMinute) / 30);
  return cols;
}

/** Tâm ô (cột 0-based, sân 1-based). */
export function cellCenter(col: number, court: number, colW: number): Point {
  return { x: Math.round(GRID.left + colW * (col + 0.5)), y: GRID.top + GRID.rowH * (court - 1) + GRID.rowH / 2 };
}

/** Vị trí ô ngày trong date picker: số lần bấm "Tháng sau" và tọa độ ô (tuần bắt đầu Thứ Hai). */
export function pickerTarget(today: string, target: string): { monthsAhead: number; x: number; y: number } {
  const [cy, cm] = today.split('-').map(Number);
  const [ty, tm, td] = target.split('-').map(Number);
  const monthsAhead = ty * 12 + tm - (cy * 12 + cm);
  const offset = (new Date(Date.UTC(ty, tm - 1, 1)).getUTCDay() + 6) % 7; // Thứ Hai = 0
  const n = offset + td - 1;
  return { monthsAhead, x: 715 + 45 * (n % 7), y: 426 + 42 * Math.floor(n / 7) };
}
