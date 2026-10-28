import jsQRModule from 'jsqr';
import { PNG } from 'pngjs';
import { encode } from 'uqr';
import { describe, expect, it } from 'vitest';
import { cropQr } from './qr.js';

const jsQR = jsQRModule as unknown as typeof jsQRModule.default;
const PAYLOAD = '00020101021238540010A000000727012400069704220110123456789020800208QRIBFTTA53037045406123456802VN62130809ALB123456304ABCD';

/** Ảnh chụp giả: nền xám, một thẻ trắng chứa QR (cỡ module `px`) tại (left, top). */
function screenshot(opts: { left: number; top: number; px: number; dark?: boolean }): Buffer {
  const m = encode(PAYLOAD, { border: 0 }).data;
  const png = new PNG({ width: 1700, height: 900 });
  const [bg, card, ink] = opts.dark ? [20, 30, 255] : [235, 255, 0];
  for (let i = 0; i < png.data.length; i += 4) png.data.set([bg, bg, bg, 255], i);
  const side = m.length * opts.px;
  const set = (x: number, y: number, v: number) => png.data.set([v, v, v, 255], (y * png.width + x) * 4);
  for (let y = opts.top - 20; y < opts.top + side + 20; y++) for (let x = opts.left - 20; x < opts.left + side + 20; x++) set(x, y, card);
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m.length; c++) {
      if (!m[r][c]) continue;
      for (let y = 0; y < opts.px; y++) for (let x = 0; x < opts.px; x++) set(opts.left + c * opts.px + x, opts.top + r * opts.px + y, ink);
    }
  }
  return PNG.sync.write(png);
}

function decode(dataUrl: string): string | undefined {
  const png = PNG.sync.read(Buffer.from(dataUrl.replace('data:image/png;base64,', ''), 'base64'));
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
}

describe('cropQr', () => {
  it('cắt riêng mã QR và vẫn quét được nội dung gốc', () => {
    const url = cropQr(screenshot({ left: 900, top: 300, px: 4 }));
    expect(url).not.toBeNull();
    expect(decode(url!)).toBe(PAYLOAD);
  });
  it('ảnh cắt nhỏ hơn nhiều so với ảnh chụp và có độ phân giải tối thiểu', () => {
    const png = PNG.sync.read(Buffer.from(cropQr(screenshot({ left: 900, top: 300, px: 4 }))!.split(',')[1], 'base64'));
    expect(png.width).toBe(png.height);
    expect(png.width).toBeGreaterThanOrEqual(400);
    expect(png.width).toBeLessThan(900);
  });
  it('QR sát mép ảnh vẫn cắt được', () => {
    expect(decode(cropQr(screenshot({ left: 22, top: 22, px: 3 }))!)).toBe(PAYLOAD);
  });
  it('QR nền tối (đảo màu) vẫn nhận ra', () => {
    expect(decode(cropQr(screenshot({ left: 600, top: 200, px: 4, dark: true }))!)).toBe(PAYLOAD);
  });
  it('không có QR thì null', () => {
    const png = new PNG({ width: 400, height: 300 });
    png.data.fill(240);
    expect(cropQr(PNG.sync.write(png))).toBeNull();
  });
});
