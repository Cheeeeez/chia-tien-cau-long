import { describe, expect, it } from 'vitest';
import { COURT_OWNER_BANK, courtTransferNote } from './courtPay';
import { findBank } from './vietqr';

describe('courtTransferNote', () => {
  it('lấy số trong mã đơn Alobo (#5776) ghép vào nội dung', () => {
    expect(courtTransferNote('#5776', 'Nam')).toBe('Thanh toan online lich dat 5776');
  });
  it('mã đơn không có dấu # vẫn lấy được số', () => {
    expect(courtTransferNote('5776', 'Nam')).toBe('Thanh toan online lich dat 5776');
  });
  it('không có mã đơn thì dùng tên người đặt không dấu + chuyen tien', () => {
    expect(courtTransferNote(null, 'Nguyễn Đức Nam')).toBe('NGUYEN DUC NAM chuyen tien');
  });
  it('mã đơn không có số cũng quay về tên + chuyen tien', () => {
    expect(courtTransferNote('abc', 'Nam')).toBe('NAM chuyen tien');
  });
  it('tên dài bị cắt để cả nội dung không quá 40 ký tự mà vẫn giữ chuyen tien', () => {
    const note = courtTransferNote(null, 'Nguyen Thi Phuong Thao Hoang Gia Bao Long Minh');
    expect(note.length).toBeLessThanOrEqual(40);
    expect(note.endsWith(' chuyen tien')).toBe(true);
  });
  it('tên trống thì chỉ còn chuyen tien', () => {
    expect(courtTransferNote(null, '  ')).toBe('chuyen tien');
  });
});

describe('COURT_OWNER_BANK', () => {
  it('trỏ tới TPBank trong danh sách ngân hàng', () => {
    expect(findBank(COURT_OWNER_BANK.bin)?.shortName).toBe('TPBank');
  });
});
