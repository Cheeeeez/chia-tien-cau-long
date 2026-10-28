import { toAsciiUpper } from './text';
import type { BankInfo } from './types';

/** Tài khoản nhận tiền sân (TPBank 970423): dùng để tự tạo QR/mở app ngân hàng khi không cắt được QR của Alobo. */
export const COURT_OWNER_BANK: BankInfo = { bin: '970423', accountNo: '09153600053', accountName: 'DO THI NHU QUYNH' };

const SUFFIX = ' chuyen tien';
const MAX_NOTE = 40; // như transferNote: nhiều app ngân hàng cắt nội dung chuyển dài

/**
 * Nội dung chuyển khoản cho đơn Alobo: "Thanh toan online lich dat <số trong mã đơn>" (mã đơn Alobo hiển thị dạng "#5776").
 * Không có số trong mã đơn thì dùng "<tên người đặt> chuyen tien".
 */
export function courtTransferNote(orderId: string | null, payerName: string): string {
  const code = /\d+/.exec(orderId ?? '')?.[0];
  if (code) return `Thanh toan online lich dat ${code}`;
  const name = toAsciiUpper(payerName).slice(0, MAX_NOTE - SUFFIX.length).trim();
  return (name + SUFFIX).trim();
}
