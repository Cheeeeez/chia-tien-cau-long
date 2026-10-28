import jsQRModule from 'jsqr';
import { PNG } from 'pngjs';

// jsqr là UMD: lúc chạy (Node ESM) import mặc định chính là hàm, nhưng typings khai báo hàm ở `.default` nên ép kiểu cho khớp.
const jsQR = jsQRModule as unknown as typeof jsQRModule.default;

const MIN_SIDE = 400; // phóng nguyên số lần (nearest) tới tối thiểu ngần này px để mã còn nét khi hiển thị
const BLEED = 0.03; // lấy dư mép ngoài của khung nhận dạng vì toạ độ góc chỉ là ước lượng
const QUIET = 0.15; // viền trắng quanh mã: chuẩn QR cần ≥ 4 module (≈ 7–19% cạnh tuỳ phiên bản)

/**
 * Tìm mã QR trong ảnh chụp (PNG) rồi trả về ảnh PNG data URL chỉ gồm mã đó, kèm viền trắng; null nếu không thấy mã nào.
 * Màn thanh toán của Alobo vẽ QR trên canvas Flutter nên không đọc được từ DOM, chỉ lấy được từ ảnh chụp.
 */
export function cropQr(screenshot: Buffer): string | null {
  const src = PNG.sync.read(screenshot);
  const found = jsQR(new Uint8ClampedArray(src.data.buffer, src.data.byteOffset, src.data.byteLength), src.width, src.height, {
    inversionAttempts: 'attemptBoth',
  });
  if (!found) return null;

  const { topLeftCorner: a, topRightCorner: b, bottomLeftCorner: c, bottomRightCorner: d } = found.location;
  const xs = [a.x, b.x, c.x, d.x];
  const ys = [a.y, b.y, c.y, d.y];
  const bleed = Math.ceil((Math.max(...xs) - Math.min(...xs)) * BLEED);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - bleed);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)) - bleed);
  const x1 = Math.min(src.width, Math.ceil(Math.max(...xs)) + bleed);
  const y1 = Math.min(src.height, Math.ceil(Math.max(...ys)) + bleed);
  const w = x1 - x0;
  const h = y1 - y0;
  const side = Math.max(w, h);
  const pad = Math.round(side * QUIET);
  const scale = Math.max(1, Math.ceil(MIN_SIDE / (side + 2 * pad)));

  const out = new PNG({ width: (side + 2 * pad) * scale, height: (side + 2 * pad) * scale });
  out.data.fill(255); // trắng, alpha 255
  for (let y = 0; y < h * scale; y++) {
    for (let x = 0; x < w * scale; x++) {
      const s = ((y0 + Math.floor(y / scale)) * src.width + x0 + Math.floor(x / scale)) * 4;
      const o = ((pad * scale + y) * out.width + pad * scale + x) * 4;
      out.data[o] = src.data[s];
      out.data[o + 1] = src.data[s + 1];
      out.data[o + 2] = src.data[s + 2];
    }
  }
  return 'data:image/png;base64,' + PNG.sync.write(out).toString('base64');
}
