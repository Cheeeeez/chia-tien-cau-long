import { useEffect, useState } from 'preact/hooks';
import { appliedDebts, billUrl, deferKey, draftToBill, participantIds, validateDraft } from '../lib/bill';
import { shortenUrl } from '../lib/shorten';
import { copyText } from '../lib/clipboard';
import { MANUAL, commitBill, openDebts } from '../lib/debts';
import { buildMessage } from '../lib/message';
import { expenseAmount, formatVnd } from '../lib/money';
import { settle } from '../lib/split';
import { loadDebts, loadRoster, saveDebts, saveRoster } from '../lib/storage';
import type { Debt, Draft, DraftExpense, Member } from '../lib/types';
import { DebtsEditor } from './DebtsEditor';
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

const validWeight = (w: number) => Number.isFinite(w) && w >= 0 && w <= 10 && Number.isInteger(w * 2);

function WeightInput({ value, onCommit }: { value: number; onCommit: (w: number) => void }) {
  const [text, setText] = useState(String(value));
  // Nút "Đi cùng"/"Chia tiền" đổi value từ ngoài; đồng bộ lại ô nhập (không đè khi đang gõ giá trị tương đương).
  useEffect(() => setText((t) => (Number(t) === value && t !== '' ? t : String(value))), [value]);
  return (
    <label class="weight">
      Suất
      <input
        type="number"
        step="0.5"
        min="0"
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

function SharerPicker({ players, sharers, onChange }: {
  players: Member[];
  sharers: string[] | undefined;
  onChange: (sharers: string[] | undefined) => void;
}) {
  const all = sharers === undefined;
  const count = all ? players.length : players.filter((m) => sharers.includes(m.id)).length;
  return (
    <div class="sharer-picker">
      <span class="field-label">Khoản này chia cho ai?</span>
      <div class="segmented" role="group" aria-label="Chia cho">
        <button type="button" class={all ? 'primary' : 'neutral'} aria-pressed={all} onClick={() => onChange(undefined)}>
          Tất cả người đi
        </button>
        <button
          type="button"
          class={all ? 'neutral' : 'primary'}
          aria-pressed={!all}
          disabled={players.length === 0}
          onClick={() => {
            if (all) onChange(players.map((m) => m.id));
          }}
        >
          Chọn người
        </button>
      </div>
      {all ? (
        <span class="hint">
          {count > 0
            ? `Mọi người đi hôm nay cùng chia khoản này (${count} người).`
            : 'Chọn người ở mục "Ai đi hôm nay" để chia riêng từng khoản.'}
        </span>
      ) : (
        <>
          <div class="sharers">
            {players.map((m) => (
              <label class="check" key={m.id}>
                <input
                  type="checkbox"
                  checked={sharers.includes(m.id)}
                  onChange={(e) => {
                    const on = (e.currentTarget as HTMLInputElement).checked;
                    onChange(on ? [...sharers, m.id] : sharers.filter((id) => id !== m.id));
                  }}
                />
                {m.name}
              </label>
            ))}
          </div>
          <span class="hint">Chỉ {count}/{players.length} người được tick chia khoản này; bỏ tick người không dùng.</span>
        </>
      )}
    </div>
  );
}

export function Creator({ baseUrl }: { baseUrl: string }) {
  const [roster, setRoster] = useState<Member[]>(loadRoster);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => ({
    date: today(),
    expenses: [newExpense('Tiền sân'), newExpense('Tiền cầu', SHUTTLE_PRICE)],
    weights: {},
    defer: [],
  }));
  const [feedback, setFeedback] = useState('');
  const [ledger, setLedger] = useState<Debt[]>(loadDebts);
  const [session] = useState(() => crypto.randomUUID());

  useEffect(() => saveRoster(roster), [roster]);
  useEffect(() => saveDebts(ledger), [ledger]);

  const changeRoster = (next: Member[]) => {
    const ids = new Set(next.map((m) => m.id));
    setRoster(next);
    setLedger((l) => l.filter((d) => ids.has(d.from) && ids.has(d.to)));
    setDraft((d) => ({
      ...d,
      weights: Object.fromEntries(Object.entries(d.weights).filter(([id]) => ids.has(id))),
      expenses: d.expenses.map((x) => (x.payerId && !ids.has(x.payerId) ? { ...x, payerId: '' } : x)),
      defer: d.defer.filter((key) => key.split('>').every((id) => ids.has(id))),
    }));
  };

  const patchExpense = (key: string, patch: Partial<DraftExpense>) =>
    setDraft((d) => ({ ...d, expenses: d.expenses.map((x) => (x.key === key ? { ...x, ...patch } : x)) }));

  const setWeight = (id: string, w: number) =>
    setDraft((d) => ({ ...d, weights: { ...d.weights, [id]: w } }));

  const toggle = (id: string, on: boolean) =>
    setDraft((d) => {
      const weights = { ...d.weights };
      if (on) weights[id] = 1;
      else delete weights[id];
      return { ...d, weights };
    });

  // fallbackLong: không rút gọn được (mạng lỗi/quá giới hạn) nên đã dùng link dài.
  const flash = async (text: string, fallbackLong: boolean) => {
    const ok = await copyText(text);
    setFeedback(!ok ? 'Không copy được, hãy bấm giữ để copy' : fallbackLong ? 'Đã copy (link dài, chưa rút gọn được)' : 'Đã copy');
    setTimeout(() => setFeedback(''), 2000);
  };

  const open = openDebts(ledger, session);
  const applied = appliedDebts(roster, draft, open);
  const ids = participantIds(roster, draft);
  const players = roster.filter((m) => (draft.weights[m.id] ?? 0) > 0);
  const errors = validateDraft(roster, draft, open);
  let result = null;
  let url = '';
  if (errors.length === 0) {
    const bill = draftToBill(roster, draft, open);
    const s = settle(bill);
    url = billUrl(baseUrl, bill);
    const commit = () =>
      setLedger((l) =>
        commitBill(
          l,
          session,
          applied.map((d) => d.id),
          s.deferred.map((t) => ({ from: ids[t.from], to: ids[t.to], amount: t.amount, date: draft.date })),
        ),
      );
    // Đã rút gọn sẵn (xem useEffect bên dưới) nên await trả về ngay, giữ nguyên thao tác người dùng cho navigator.share.
    // commit() chạy trước mọi await.
    const share = async () => {
      commit();
      const link = await shortenUrl(url);
      await navigator.share({ text: buildMessage(bill, s, link) }).catch(() => {});
    };
    const copy = async (build: (link: string) => string) => {
      commit();
      const link = await shortenUrl(url);
      await flash(build(link), link === url);
    };
    result = (
      <>
        <SettlementView
          bill={bill}
          s={s}
          onDefer={(t, on) => {
            const key = deferKey(ids[t.from], ids[t.to]);
            setDraft((d) => ({ ...d, defer: on ? [...d.defer, key] : d.defer.filter((x) => x !== key) }));
          }}
        />
        <div class="row-actions wrap">
          {typeof navigator.share === 'function' && (
            <button
              type="button"
              class="primary"
              onClick={share}
            >
              Chia sẻ
            </button>
          )}
          <button type="button" onClick={() => copy((link) => buildMessage(bill, s, link))}>Copy tin nhắn</button>
          <button type="button" onClick={() => copy((link) => link)}>Copy link</button>
          <a class="btn" href={url} target="_blank" rel="noreferrer">Mở link</a>
        </div>
        {(applied.length > 0 || s.deferred.length > 0) && (
          <p class="hint">Khoản “Để lần sau” và “Nợ lần trước” được lưu khi bấm Chia sẻ hoặc Copy.</p>
        )}
        {feedback && <p class="hint" role="status">{feedback}</p>}
      </>
    );
  }

  // Rút gọn trước khi người dùng bấm. Chờ 1.5s sau lần sửa cuối để không tốn giới hạn 5 request/phút của dịch vụ.
  useEffect(() => {
    if (!url) return;
    const t = setTimeout(() => void shortenUrl(url), 1500);
    return () => clearTimeout(t);
  }, [url]);

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
            <SharerPicker players={players} sharers={x.sharers} onChange={(sharers) => patchExpense(x.key, { sharers })} />
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
        <ul class="list who">
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
              {draft.weights[m.id] === undefined ? (
                <button type="button" class="neutral" onClick={() => setWeight(m.id, 0)}>
                  + Đi cùng
                </button>
              ) : (
                <>
                  <WeightInput value={draft.weights[m.id]} onCommit={(w) => setWeight(m.id, w)} />
                  {draft.weights[m.id] === 0 ? (
                    <button type="button" onClick={() => setWeight(m.id, 1)}>Chia tiền</button>
                  ) : (
                    <button type="button" class="neutral" onClick={() => setWeight(m.id, 0)}>Đi cùng</button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Nợ lần trước</h2>
        <DebtsEditor
          roster={roster}
          debts={open}
          applied={new Set(applied.map((d) => d.id))}
          onAdd={(d) =>
            setLedger((l) => [...l, { ...d, id: crypto.randomUUID(), date: today(), src: MANUAL }])
          }
          onRemove={(id) => setLedger((l) => l.filter((d) => d.id !== id))}
        />
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
