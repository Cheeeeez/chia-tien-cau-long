import type { Debt, Member, SavedDraft } from './types';

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

export const DRAFT_KEY = 'caulong.draft.v1';

const isFiniteNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

const isSavedDraft = (x: unknown): x is SavedDraft => {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  if (typeof s.session !== 'string' || s.session === '' || typeof s.shared !== 'boolean') return false;
  const d = s.draft as Record<string, unknown> | null;
  if (typeof d !== 'object' || d === null) return false;
  if (typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return false;
  if (!Array.isArray(d.expenses)) return false;
  for (const e of d.expenses as unknown[]) {
    if (typeof e !== 'object' || e === null) return false;
    const x = e as Record<string, unknown>;
    if (
      typeof x.key !== 'string' ||
      typeof x.label !== 'string' ||
      !isFiniteNumber(x.qty) ||
      !isFiniteNumber(x.unitPrice) ||
      typeof x.payerId !== 'string' ||
      !(x.sharers === undefined || (Array.isArray(x.sharers) && x.sharers.every((id) => typeof id === 'string')))
    ) {
      return false;
    }
  }
  const w = d.weights;
  if (typeof w !== 'object' || w === null || Array.isArray(w)) return false;
  if (!Object.values(w).every(isFiniteNumber)) return false;
  return Array.isArray(d.defer) && d.defer.every((k) => typeof k === 'string');
};

export function loadDraft(): SavedDraft | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    return isSavedDraft(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveDraft(s: SavedDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(s));
  } catch {
    // bỏ qua
  }
}

const SELF_KEY = 'caulong.self.v1';

/** id thành viên được tick "Bản thân". */
export function loadSelf(): string | null {
  try {
    return localStorage.getItem(SELF_KEY) || null;
  } catch {
    return null;
  }
}

export function saveSelf(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(SELF_KEY);
    else localStorage.setItem(SELF_KEY, id);
  } catch {
    // bỏ qua
  }
}

const BOOKING_KEY = 'caulong.booking.v2';

export interface BookingSettings {
  phone: string;
  /** Tên khi đặt không cần tài khoản. */
  name: string;
  /** Mã truy cập chung của nhóm (quản trị viên đặt trong BOOKING_TOKEN của máy chủ). */
  code: string;
  /** `<sđt>:<mã thiết bị>` do máy chủ cấp khi đăng nhập Alobo; rỗng = chưa đăng nhập. */
  session: string;
  /** Đặt như khách (gõ tên + SĐT) hay bằng tài khoản Alobo đã đăng nhập. */
  who: 'guest' | 'account';
}

export function loadBookingSettings(): BookingSettings {
  let v: Record<string, unknown> = {};
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(BOOKING_KEY) ?? '{}');
    if (raw && typeof raw === 'object') v = raw as Record<string, unknown>;
  } catch {
    // dữ liệu hỏng hoặc localStorage không khả dụng: dùng mặc định
  }
  const str = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : '');
  return { phone: str('phone'), name: str('name'), code: str('code'), session: str('session'), who: str('who') === 'account' ? 'account' : 'guest' };
}

export function saveBookingSettings(s: BookingSettings): void {
  try {
    localStorage.setItem(BOOKING_KEY, JSON.stringify(s));
  } catch {
    // bỏ qua
  }
}
