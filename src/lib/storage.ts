import type { Debt, Member } from './types';

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

const DEBTS_KEY = 'caulong.debts.v1';

const isDebt = (x: unknown): x is Debt => {
  if (typeof x !== 'object' || x === null) return false;
  const d = x as Record<string, unknown>;
  return (
    typeof d.id === 'string' &&
    typeof d.from === 'string' &&
    typeof d.to === 'string' &&
    typeof d.date === 'string' &&
    typeof d.src === 'string' &&
    typeof d.amount === 'number' &&
    Number.isInteger(d.amount) &&
    d.amount > 0 &&
    (d.usedBy === undefined || typeof d.usedBy === 'string')
  );
};

export function loadDebts(): Debt[] {
  try {
    const v = JSON.parse(localStorage.getItem(DEBTS_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter(isDebt) : [];
  } catch {
    return [];
  }
}

export function saveDebts(debts: Debt[]): void {
  try {
    localStorage.setItem(DEBTS_KEY, JSON.stringify(debts));
  } catch {
    // bỏ qua
  }
}
