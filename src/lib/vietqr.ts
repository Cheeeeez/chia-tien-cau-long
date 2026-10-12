import banks from '../data/banks.json';
import androidApps from '../data/apps-android.json';
import iosApps from '../data/apps-ios.json';
import { toAsciiUpper } from './text';
import type { BankInfo } from './types';

export type BankEntry = { bin: string; code: string; shortName: string };
export type BankApp = { appId: string; appName: string; autofill: boolean; monthlyInstall: number };

export const allBanks: BankEntry[] = banks;

const enc = encodeURIComponent;

export const findBank = (bin: string): BankEntry | undefined => allBanks.find((b) => b.bin === bin);

export function transferNote(date: string, payerName: string): string {
  const [, mm, dd] = date.split('-');
  return toAsciiUpper(`CAU LONG ${dd}${mm} ${payerName}`).slice(0, 40).trim();
}

export const qrImageUrl = (bank: BankInfo, amount: number, note: string): string =>
  `https://img.vietqr.io/image/${bank.bin}-${bank.accountNo}-compact2.png?amount=${amount}&addInfo=${enc(note)}&accountName=${enc(bank.accountName)}`;

export function bankAppLink(
  appId: string,
  bank: BankInfo,
  amount: number,
  note: string,
  returnUrl: string,
): string | null {
  const info = findBank(bank.bin);
  if (!info) return null;
  // dl.vietqr.io trả lỗi "invalid accountName" khi bn ngắn hơn 5 ký tự (đã kiểm chứng); bn là tuỳ chọn nên bỏ đi.
  const bn = bank.accountName.length >= 5 ? `&bn=${enc(bank.accountName)}` : '';
  return `https://dl.vietqr.io/pay?app=${appId}&ba=${bank.accountNo}@${info.code.toLowerCase()}&am=${amount}&tn=${enc(note)}${bn}&url=${enc(returnUrl)}`;
}

export const isMobile = (ua: string): boolean => /Android|iPhone|iPad|iPod/i.test(ua);

export function bankAppsForPlatform(ua: string): BankApp[] {
  const list: BankApp[] = /iPhone|iPad|iPod/i.test(ua) ? iosApps : androidApps;
  return [...list].sort(
    (a, b) =>
      Number(b.autofill) - Number(a.autofill) ||
      b.monthlyInstall - a.monthlyInstall ||
      a.appName.localeCompare(b.appName),
  );
}
