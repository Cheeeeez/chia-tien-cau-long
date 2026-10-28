import { PNG } from 'pngjs';
import { HttpError } from '../errors.js';
import { COLOR, GRID } from './layout.js';

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

/** Độ rộng một cột 30 phút, đo từ mép phải của lưới (nền lưới khác nền ngoài lưới). */
export function gridColumnWidth(shot: Shot, screenshot?: string): number {
  let edge = -1;
  for (let x = 1699; x >= 1000; x--) {
    const c = shot.rgb(x, GRID.scanY);
    if (!COLOR.background.some((bg) => near(c, bg, 6))) {
      edge = x + 1;
      break;
    }
  }
  const w = edge < 0 ? NaN : (edge - GRID.left) / GRID.cols;
  if (!(w >= GRID.minColW && w <= GRID.maxColW)) {
    throw new HttpError('Bố cục bảng lịch Alobo đã thay đổi', 502, screenshot);
  }
  return w;
}

export const isFree = (rgb: RGB) => near(rgb, COLOR.free, 10);
export const isSelected = (rgb: RGB) => near(rgb, COLOR.selected, 16);
