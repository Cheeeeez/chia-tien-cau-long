import { HttpError } from './errors.js';

/** Alobo nhận PNG/JPG tối đa 5MB. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Giải mã ảnh gửi dạng data URL; kiểm tra loại, chữ ký tệp và dung lượng. */
export function decodeImage(dataUrl: unknown): { buffer: Buffer; fileName: string } {
  const m = typeof dataUrl === 'string' ? /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl) : null;
  if (!m) throw new HttpError('Ảnh phải là PNG hoặc JPG', 400);
  const buffer = Buffer.from(m[2], 'base64');
  const isPng = buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  if (m[1] === 'png' ? !isPng : !isJpeg) throw new HttpError('Tệp không phải ảnh PNG/JPG hợp lệ', 400);
  if (buffer.length > MAX_IMAGE_BYTES) throw new HttpError('Ảnh quá 5MB', 413);
  return { buffer, fileName: m[1] === 'png' ? 'thanh-toan.png' : 'thanh-toan.jpg' };
}
