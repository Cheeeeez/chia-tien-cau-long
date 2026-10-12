import { useEffect, useState } from 'preact/hooks';
import { billUrl, draftToBill, validateDraft } from '../lib/bill';
import { copyText } from '../lib/clipboard';
import { buildMessage } from '../lib/message';
import { expenseAmount, formatVnd } from '../lib/money';
import { settle } from '../lib/split';
import { loadRoster, saveRoster } from '../lib/storage';
import type { Draft, DraftExpense, Member } from '../lib/types';
import { InstallButton } from './InstallButton';
import { RosterEditor } from './RosterEditor';
import { SettlementView } from './SettlementView';

const SHUTTLE_PRICE = 30000;

const newExpense = (label: string, unitPrice = 0): DraftExpense => ({
  key: crypto.randomUUID(),
  label,
  qty: 1,
  unitPrice,
  payerId: '',
});

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const validWeight = (w: number) => Number.isFinite(w) && w >= 0.5 && w <= 10 && Number.isInteger(w * 2);

function WeightInput({ value, onCommit }: { value: number; onCommit: (w: number) => void }) {
  const [text, setText] = useState(String(value));
  return (
    <label class="weight">
      Suất
      <input
        type="number"
        step="0.5"
        min="0.5"
        max="10"
        value={text}
        onInput={(e) => {
          const t = (e.currentTarget as HTMLInputElement).value;
          setText(t);
          const w = Number(t);
          if (t !== '' && validWeight(w)) onCommit(w);
        }}
        onBlur={() => setText(String(value))}
      />
    </label>
  );
}

export function Creator({ baseUrl }: { baseUrl: string }) {
  const [roster, setRoster] = useState<Member[]>(loadRoster);
  const [rosterOpen, setRosterOpen] = useState(true);
  const [draft, setDraft] = useState<Draft>(() => ({
    date: today(),
    expenses: [newExpense('Tiền sân'), newExpense('Tiền cầu', SHUTTLE_PRICE)],
    weights: {},
  }));
  const [feedback, setFeedback] = useState('');

  useEffect(() => saveRoster(roster), [roster]);

  const changeRoster = (next: Member[]) => {
    const ids = new Set(next.map((m) => m.id));
    setRoster(next);
    setDraft((d) => ({
      ...d,
      weights: Object.fromEntries(Object.entries(d.weights).filter(([id]) => ids.has(id))),
      expenses: d.expenses.map((x) => (x.payerId && !ids.has(x.payerId) ? { ...x, payerId: '' } : x)),
    }));
  };

  const patchExpense = (key: string, patch: Partial<DraftExpense>) =>
    setDraft((d) => ({ ...d, expenses: d.expenses.map((x) => (x.key === key ? { ...x, ...patch } : x)) }));

  const toggle = (id: string, on: boolean) =>
    setDraft((d) => {
      const weights = { ...d.weights };
      if (on) weights[id] = 1;
      else delete weights[id];
      return { ...d, weights };
    });

  const flash = async (text: string) => {
    const ok = await copyText(text);
    setFeedback(ok ? 'Đã copy' : 'Không copy được, hãy bấm giữ để copy');
    setTimeout(() => setFeedback(''), 2000);
  };

  const errors = validateDraft(roster, draft);
  let result = null;
  if (errors.length === 0) {
    const bill = draftToBill(roster, draft);
    const s = settle(bill);
    const url = billUrl(baseUrl, bill);
    const msg = buildMessage(bill, s, url);
    result = (
      <>
        <SettlementView bill={bill} s={s} />
        <div class="row-actions wrap">
          {typeof navigator.share === 'function' && (
            <button type="button" class="primary" onClick={() => navigator.share({ text: msg }).catch(() => {})}>
              Chia sẻ
            </button>
          )}
          <button type="button" onClick={() => flash(msg)}>Copy tin nhắn</button>
          <button type="button" onClick={() => flash(url)}>Copy link</button>
          <a class="btn" href={url} target="_blank" rel="noreferrer">Mở link</a>
        </div>
        {feedback && <p class="hint" role="status">{feedback}</p>}
      </>
    );
  }

  return (
    <main>
      <h1>🏸 Chia tiền cầu lông</h1>
      <InstallButton />

      <section>
        <h2>
          <button
            type="button"
            class="collapse-toggle"
            aria-expanded={rosterOpen}
            onClick={() => setRosterOpen((v) => !v)}
          >
            <span>Thành viên <span class="muted">({roster.length})</span></span>
            <span aria-hidden="true">{rosterOpen ? '▾' : '▸'}</span>
          </button>
        </h2>
        {/* Ẩn bằng hidden thay vì gỡ khỏi DOM để form đang nhập dở không bị mất. */}
        <div hidden={!rosterOpen}>
          <RosterEditor roster={roster} onChange={changeRoster} />
        </div>
      </section>

      <section>
        <h2>Khoản chi</h2>
        <label class="field">
          <span>Ngày</span>
          <input
            type="date"
            value={draft.date}
            onInput={(e) => {
              const v = (e.currentTarget as HTMLInputElement).value;
              if (v) setDraft((d) => ({ ...d, date: v }));
            }}
          />
        </label>
        {draft.expenses.map((x) => (
          <div class="card expense" key={x.key}>
            <input
              aria-label="Tên khoản"
              placeholder="Tên khoản"
              value={x.label}
              maxLength={40}
              onInput={(e) => patchExpense(x.key, { label: (e.currentTarget as HTMLInputElement).value })}
            />
            <div class="grid2">
              <label class="field">
                <span>Số lượng</span>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={x.qty || ''}
                  onInput={(e) => patchExpense(x.key, { qty: Number((e.currentTarget as HTMLInputElement).value) || 0 })}
                />
              </label>
              <label class="field">
                <span>Đơn giá (đ)</span>
                <input
                  type="number"
                  step="1000"
                  min="0"
                  inputMode="numeric"
                  placeholder="0"
                  value={x.unitPrice || ''}
                  onInput={(e) => patchExpense(x.key, { unitPrice: Math.round(Number((e.currentTarget as HTMLInputElement).value)) || 0 })}
                />
              </label>
            </div>
            <select
              aria-label="Người ứng"
              value={x.payerId}
              onChange={(e) => patchExpense(x.key, { payerId: (e.currentTarget as HTMLSelectElement).value })}
            >
              <option value="">-- Ai ứng? --</option>
              {roster.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <div class="row-actions between">
              <strong>{formatVnd(expenseAmount(x.qty, x.unitPrice))}</strong>
              <button
                type="button"
                class="danger"
                onClick={() => setDraft((d) => ({ ...d, expenses: d.expenses.filter((y) => y.key !== x.key) }))}
              >
                Xoá
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setDraft((d) => ({ ...d, expenses: [...d.expenses, newExpense('Tiền cầu', SHUTTLE_PRICE)] }))}
        >
          + Thêm khoản
        </button>
      </section>

      <section>
        <h2>Ai đi hôm nay</h2>
        <ul class="list">
          {roster.map((m) => (
            <li key={m.id}>
              <label class="check">
                <input
                  type="checkbox"
                  checked={draft.weights[m.id] !== undefined}
                  onChange={(e) => toggle(m.id, (e.currentTarget as HTMLInputElement).checked)}
                />
                {m.name}
              </label>
              {draft.weights[m.id] !== undefined && (
                <WeightInput
                  value={draft.weights[m.id]}
                  onCommit={(w) => setDraft((d) => ({ ...d, weights: { ...d.weights, [m.id]: w } }))}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Kết quả</h2>
        {errors.length > 0 ? (
          <ul class="error">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : (
          result
        )}
      </section>
    </main>
  );
}
