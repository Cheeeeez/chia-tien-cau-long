import { useState } from 'preact/hooks';
import { toAsciiUpper } from '../lib/text';
import type { Member } from '../lib/types';
import { allBanks, findBank } from '../lib/vietqr';

type Form = { id: string | null; name: string; bin: string; accountNo: string; accountName: string };
const empty: Form = { id: null, name: '', bin: '', accountNo: '', accountName: '' };

export function RosterEditor({
  roster,
  onChange,
}: {
  roster: Member[];
  onChange: (next: Member[]) => void;
}) {
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');

  const edit = (m: Member) => {
    setError('');
    setForm({
      id: m.id,
      name: m.name,
      bin: m.bank?.bin ?? '',
      accountNo: m.bank?.accountNo ?? '',
      accountName: m.bank?.accountName ?? '',
    });
  };

  const save = (e: Event) => {
    e.preventDefault();
    if (!form) return;
    const name = form.name.trim();
    const accountNo = form.accountNo.trim();
    if (!name) return setError('Tên không được trống');
    if (roster.some((m) => m.id !== form.id && m.name.trim().toLowerCase() === name.toLowerCase())) {
      return setError('Tên đã tồn tại');
    }
    if (accountNo && !form.bin) return setError('Chọn ngân hàng');
    if (form.bin && !/^[A-Za-z0-9]{1,19}$/.test(accountNo)) {
      return setError('Số tài khoản chỉ gồm chữ/số, tối đa 19 ký tự');
    }
    const bank =
      !form.bin && !accountNo
        ? null
        : { bin: form.bin, accountNo, accountName: toAsciiUpper(form.accountName || name).slice(0, 50) };
    const member: Member = { id: form.id ?? crypto.randomUUID(), name, bank };
    onChange(
      form.id === null ? [...roster, member] : roster.map((m) => (m.id === form.id ? member : m)),
    );
    setForm(null);
    setError('');
  };

  const set = (k: keyof Form) => (e: Event) =>
    setForm((f) => (f ? { ...f, [k]: (e.currentTarget as HTMLInputElement).value } : f));

  return (
    <div>
      <ul class="list">
        {roster.map((m) => (
          <li key={m.id}>
            <div>
              <strong>{m.name}</strong>
              <div class="muted">
                {m.bank ? `${findBank(m.bank.bin)?.shortName ?? m.bank.bin} • ${m.bank.accountNo}` : 'chưa có TK'}
              </div>
            </div>
            <div class="row-actions">
              <button type="button" onClick={() => edit(m)}>Sửa</button>
              <button type="button" onClick={() => onChange(roster.filter((x) => x.id !== m.id))}>Xoá</button>
            </div>
          </li>
        ))}
      </ul>
      {form ? (
        <form class="card" onSubmit={save}>
          <label class="field">
            <span>Tên</span>
            <input value={form.name} maxLength={40} onInput={set('name')} />
          </label>
          <label class="field">
            <span>Ngân hàng</span>
            <select value={form.bin} onChange={set('bin')}>
              <option value="">-- Không --</option>
              {allBanks.map((b) => (
                <option key={b.bin} value={b.bin}>{b.shortName}</option>
              ))}
            </select>
          </label>
          <label class="field">
            <span>Số tài khoản</span>
            <input value={form.accountNo} inputMode="numeric" onInput={set('accountNo')} />
          </label>
          <label class="field">
            <span>Tên chủ TK</span>
            <input value={form.accountName} maxLength={50} onInput={set('accountName')} />
          </label>
          {error && <p class="error">{error}</p>}
          <div class="row-actions">
            <button type="submit" class="primary">Lưu</button>
            <button type="button" onClick={() => { setForm(null); setError(''); }}>Huỷ</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => { setError(''); setForm(empty); }}>+ Thêm thành viên</button>
      )}
    </div>
  );
}
