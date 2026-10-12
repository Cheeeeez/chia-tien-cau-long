import { useState } from 'preact/hooks';
import { formatVnd } from '../lib/money';
import { settle } from '../lib/split';
import { formatDate } from '../lib/text';
import type { Bill } from '../lib/types';
import { PayCard } from './PayCard';
import { SettlementView } from './SettlementView';

export function BillView({ bill, baseUrl }: { bill: Bill; baseUrl: string }) {
  const s = settle(bill);
  const [me, setMe] = useState(-1);
  const outgoing = s.transfers.filter((t) => t.from === me);
  const incoming = s.transfers.filter((t) => t.to === me);

  return (
    <main>
      <h1>🏸 Cầu lông {formatDate(bill.d)}</h1>
      <SettlementView bill={bill} s={s} />
      <label class="field">
        <span>Bạn là ai?</span>
        <select value={me} onChange={(e) => setMe(Number((e.currentTarget as HTMLSelectElement).value))}>
          <option value={-1}>-- Chọn tên --</option>
          {bill.p.map((p, i) => (
            <option key={i} value={i}>{p.n}</option>
          ))}
        </select>
      </label>
      {me >= 0 && (
        <>
          {outgoing.map((t, i) => (
            <PayCard key={`${t.from}-${t.to}-${i}`} bill={bill} t={t} baseUrl={baseUrl} />
          ))}
          {incoming.length > 0 && (
            <p class="card">
              Bạn sẽ nhận <strong>{formatVnd(incoming.reduce((a, t) => a + t.amount, 0))}</strong> từ:{' '}
              {incoming.map((t) => bill.p[t.from].n).join(', ')}
            </p>
          )}
          {outgoing.length === 0 && incoming.length === 0 && <p class="card">Bạn không cần chuyển khoản.</p>}
        </>
      )}
    </main>
  );
}
