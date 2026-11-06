import { PNG } from 'pngjs';
import { HttpError } from '../errors.js';
import { COLOR, GRID, type GridGeometry } from './layout.js';

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mọi kênh lệch ≤ tol so với màu hex. */
export function near(rgb: RGB, hex: string, tol = 24): boolean {
  const t = hexToRgb(hex);
  return rgb.every((v, i) => Math.abs(v - t[i]) <= tol);
}

export class Shot {
  private png: PNG;
  constructor(png: Buffer) {
    this.png = PNG.sync.read(png);
  }
  rgb(x: number, y: number): RGB {
    const { width, height, data } = this.png;
    if (x < 0 || y < 0 || x >= width || y >= height) throw new RangeError(`pixel (${x},${y}) ngoài ảnh`);
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  }
}

const isBackground = (rgb: RGB) => COLOR.background.some((bg) => near(rgb, bg, 6));

/**
 * Mép trên của lưới = dòng ngay dưới dải nhãn giờ. Đi xuống cột `headerScanX` (ngoài lưới, dải nhãn giờ trải kín tới đó):
 * gặp dải nhãn giờ, đi hết dải, bỏ qua đường viền 1px, tới nền thì đó là hàng sân 1. null nếu không thấy dải nhãn giờ.
 */
function gridTop(shot: Shot): number | null {
  const { headerScanX: x, headerScanFrom, headerScanTo } = GRID;
  const inHeader = (y: number) => near(shot.rgb(x, y), COLOR.gridHeader, 8);
  let y = headerScanFrom;
  while (y < headerScanTo && !inHeader(y)) y++;
  while (y < headerScanTo && inHeader(y)) y++;
  while (y < headerScanTo && !isBackground(shot.rgb(x, y))) y++;
  return y < headerScanTo ? y : null;
}

/**
 * Đo lưới lịch: mép trên (hàng sân 1) và độ rộng một cột 30 phút. Độ rộng đo từ mép phải của lưới, đi từ ngoài vào trên hàng sân 1
 * (nền lưới khác nền ngoài lưới). Không đo được hoặc số đo vô lý thì coi như Alobo đổi bố cục.
 */
export function measureGrid(shot: Shot, screenshot?: string): GridGeometry {
  const changed = () => new HttpError('Bố cục bảng lịch Alobo đã thay đổi', 502, screenshot);
  const top = gridTop(shot);
  if (top === null) {
    console.error('Không thấy dải nhãn giờ của bảng lịch Alobo (màu', COLOR.gridHeader, 'ở cột', GRID.headerScanX, ')');
    throw changed();
  }
  const scanY = top + GRID.rowH / 2;
  let edge = -1;
  for (let x = GRID.headerScanX; x >= 1000; x--) {
    if (!isBackground(shot.rgb(x, scanY))) {
      edge = x + 1;
      break;
    }
  }
  const colW = edge < 0 ? NaN : (edge - GRID.left) / GRID.cols;
  if (!(colW >= GRID.minColW && colW <= GRID.maxColW)) {
    console.error(`Lưới Alobo bất thường: top=${top}, mép phải=${edge}, colW=${colW} (cho phép ${GRID.minColW}–${GRID.maxColW})`);
    throw changed();
  }
  return { top, colW };
}

export const isFree = (rgb: RGB) => near(rgb, COLOR.free, 10);
export const isSelected = (rgb: RGB) => near(rgb, COLOR.selected, 16);
