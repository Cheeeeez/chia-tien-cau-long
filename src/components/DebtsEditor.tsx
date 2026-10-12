import { useState } from 'preact/hooks';
import { formatVnd } from '../lib/money';
import { formatDate } from '../lib/text';
import type { Debt, Member } from '../lib/types';

type Form = { from: string; to: string; amount: string };
const empty: Form = { from: '', to: '', amount: '' };

export function DebtsEditor({
  roster,
  debts,
  applied,
  onAdd,
  onRemove,
}: {
  roster: Member[];
  debts: Debt[];
  applied: Set<string>;
  onAdd: (d: { from: string; to: string; amount: number }) => void;
  onRemove: (id: string) => void;
}) {
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');
  const name = (id: string) => roster.find((m) => m.id === id)?.name ?? '?';

  const save = (e: Event) => {
    e.preventDefault();
    if (!form) return;
    const amount = Number(form.amount);
    if (!form.from) return setError('Chọn người nợ');
    if (!form.to) return setError('Chọn người được trả');
    if (form.from === form.to) return setError('Hai người phải khác nhau');
    if (form.amount === '' || !Number.isInteger(amount) || amount < 1000 || amount > 100_000_000) {
      return setError('Số tiền phải là số nguyên từ 1.000đ đến 100.000.000đ');
    }
    onAdd({ from: form.from, to: form.to, amount });
    setForm(null);
    setError('');
  };

  const set = (k: keyof Form) => (e: Event) =>
    setForm((f) => (f ? { ...f, [k]: (e.currentTarget as HTMLInputElement).value } : f));

  return (
    <div>
      {debts.length === 0 ? (
        <p class="muted">Chưa có khoản nợ nào.</p>
      ) : (
        <ul class="list">
          {debts.map((d) => (
            <li key={d.id}>
              <div>
                <strong>
                  {name(d.from)} → {name(d.to)}: {formatVnd(d.amount)}
                </strong>
                <div class="muted">
                  {applied.has(d.id)
                    ? 'Cộng vào bill này'
                    : `Chờ ${name(d.from)} và ${name(d.to)} cùng có trong bill`}{' '}
                  · từ {formatDate(d.date)}
                </div>
              </div>
              <button type="button" class="danger" onClick={() => onRemove(d.id)}>Xoá</button>
            </li>
          ))}
        </ul>
      )}
      {form ? (
        <form class="card" onSubmit={save}>
          <label class="field">
            <span>Người nợ</span>
            <select value={form.from} onChange={set('from')}>
              <option value="">-- Chọn --</option>
              {roster.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <label class="field">
            <span>Người được trả</span>
            <select value={form.to} onChange={set('to')}>
              <option value="">-- Chọn --</option>
              {roster.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <label class="field">
            <span>Số tiền (đ)</span>
            <input type="number" step="1000" min="1000" inputMode="numeric" value={form.amount} onInput={set('amount')} />
          </label>
          {error && <p class="error">{error}</p>}
          <div class="row-actions">
            <button type="submit" class="primary">Lưu</button>
            <button type="button" class="neutral" onClick={() => { setForm(null); setError(''); }}>Huỷ</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => { setError(''); setForm(empty); }}>+ Thêm nợ</button>
      )}
    </div>
  );
}
