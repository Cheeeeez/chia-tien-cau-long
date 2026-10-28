import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, decodeImage } from './image.js';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const url = (mime: string, b: Buffer) => `data:image/${mime};base64,${b.toString('base64')}`;

describe('decodeImage', () => {
  it('nhận PNG và JPG, đặt tên theo loại', () => {
    expect(decodeImage(url('png', png))).toMatchObject({ fileName: 'thanh-toan.png' });
    expect(decodeImage(url('jpeg', jpeg))).toMatchObject({ fileName: 'thanh-toan.jpg' });
  });
  it('từ chối loại khác, không phải data URL, và nhãn không khớp nội dung', () => {
    expect(() => decodeImage(url('gif', png))).toThrow();
    expect(() => decodeImage('abc')).toThrow();
    expect(() => decodeImage(undefined)).toThrow();
    expect(() => decodeImage(url('png', jpeg))).toThrow(); // nhãn png nhưng nội dung jpeg
  });
  it('từ chối ảnh quá 5MB', () => {
    const big = Buffer.concat([jpeg, Buffer.alloc(MAX_IMAGE_BYTES)]);
    expect(() => decodeImage(url('jpeg', big))).toThrow(/5MB/);
  });
});
