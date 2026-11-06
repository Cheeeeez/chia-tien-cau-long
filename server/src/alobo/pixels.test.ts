import { PNG } from 'pngjs';
import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../errors.js';
import { GRID, cellCenter } from './layout.js';
import { Shot, hasGridHeader, measureGrid, readGrid } from './pixels.js';

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Ảnh 1700×1000 giả bảng lịch Alobo: nền ngoài lưới, dải nhãn giờ (33px + viền 1px) rồi lưới trắng `colW` px/cột.
 * `top` là mép trên hàng sân 1; ghi chú phía trên dài/ngắn thì `top` đổi theo (cũ 287, từng là 349).
 */
function fakeShot(opts: { top: number; colW?: number; header?: boolean; chatInNoteRow?: boolean; busy?: [col: number, court: number][] }): Shot {
  const { top, colW = 42, header = true } = opts;
  const png = new PNG({ width: 1700, height: 1000 });
  const paint = (x0: number, x1: number, y0: number, y1: number, hex: string) => {
    const [r, g, b] = rgb(hex);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * 1700 + x) * 4;
        png.data[i] = r;
        png.data[i + 1] = g;
        png.data[i + 2] = b;
        png.data[i + 3] = 255;
      }
  };
  paint(0, 1700, 0, 1000, '#edfff6'); // nền trang (vùng ghi chú)
  if (opts.chatInNoteRow) paint(900, 1000, 300, 320, '#265e43'); // chữ ghi chú nằm ngay dòng quét cũ y=307
  if (header) {
    paint(0, 1700, top - 34, top - 1, '#b2eefb');
    paint(0, 1700, top - 1, top, '#b1cfd6'); // viền dưới dải nhãn giờ
  }
  paint(0, 1700, top, 840, '#e6f8ef'); // nền ngoài lưới
  const right = GRID.left + colW * GRID.cols; // mép phải lưới (x của viền)
  paint(GRID.left, right, top, top + 480, '#ffffff');
  paint(right, right + 1, top, top + 480, '#c4c4c4'); // viền phải
  for (const [col, court] of opts.busy ?? []) {
    const c = cellCenter(col, court, { top, colW });
    paint(c.x - 3, c.x + 4, c.y - 3, c.y + 4, '#9e9e9e'); // ô đã đặt
  }
  return new Shot(PNG.sync.write(png));
}

describe('measureGrid', () => {
  it('bố cục hiện tại: ghi chú 6 dòng, lưới bắt đầu ở y=349', () => {
    const g = measureGrid(fakeShot({ top: 349, chatInNoteRow: true }));
    expect(g.top).toBe(349);
    expect(g.colW).toBeCloseTo(42, 0);
  });

  it('bố cục cũ: lưới bắt đầu ở y=287', () => {
    expect(measureGrid(fakeShot({ top: 287 })).top).toBe(287);
  });

  it('mép trên theo ghi chú dài bất kỳ', () => {
    for (const top of [260, 300, 349, 420]) expect(measureGrid(fakeShot({ top })).top).toBe(top);
  });

  it('không thấy dải nhãn giờ thì báo bố cục đổi', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => measureGrid(fakeShot({ top: 349, header: false }), 'ảnh')).toThrow(HttpError);
  });

  it('độ rộng cột ngoài khoảng cho phép thì báo bố cục đổi', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => measureGrid(fakeShot({ top: 349, colW: 30 }))).toThrow('Bố cục bảng lịch Alobo đã thay đổi');
  });
});

describe('hasGridHeader', () => {
  it('có dải nhãn giờ thì true, trang còn đang tải thì false', () => {
    expect(hasGridHeader(fakeShot({ top: 349 }))).toBe(true);
    expect(hasGridHeader(fakeShot({ top: 349, header: false }))).toBe(false);
  });
});

describe('readGrid', () => {
  it('đọc ma trận trống/đã đặt theo tâm ô', () => {
    const grid = { top: 349, colW: 42 };
    // lưới trắng; hai ô đã đặt: sân 1 cột 0, sân 4 cột cuối
    const shot = fakeShot({ top: grid.top, colW: grid.colW, busy: [[0, 1], [GRID.cols - 1, 4]] });

    const free = readGrid(shot, grid);
    expect(free).toHaveLength(10);
    expect(free.every((row) => row.length === GRID.cols)).toBe(true);
    expect(free[0][0]).toBe(false);
    expect(free[3][GRID.cols - 1]).toBe(false);
    expect(free.flat().filter((v) => !v)).toHaveLength(2);
  });
});

describe('cellCenter', () => {
  it('tâm ô theo mép trên đã đo', () => {
    // cột 0 sân 1: x = 60 + 42/2, y = 349 + 20
    expect(cellCenter(0, 1, { top: 349, colW: 42 })).toEqual({ x: 81, y: 369 });
    // sân 10 (hàng thứ 10), cột 36 (23:00)
    expect(cellCenter(36, 10, { top: 349, colW: 42 })).toEqual({ x: Math.round(60 + 42 * 36.5), y: 349 + 40 * 9 + 20 });
  });
});
