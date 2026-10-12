import type { Member } from './types';

const ROSTER_KEY = 'caulong.roster.v1';
const BANK_APP_KEY = 'caulong.bankApp.v1';

export function loadRoster(): Member[] {
  try {
    const v = JSON.parse(localStorage.getItem(ROSTER_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveRoster(roster: Member[]): void {
  try {
    localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
  } catch {
    // localStorage không khả dụng (chế độ riêng tư, đầy bộ nhớ): bỏ qua
  }
}

export function loadBankApp(): string | null {
  try {
    return localStorage.getItem(BANK_APP_KEY);
  } catch {
    return null;
  }
}

export function saveBankApp(id: string): void {
  try {
    localStorage.setItem(BANK_APP_KEY, id);
  } catch {
    // bỏ qua
  }
}
