import { formatVnd } from '../lib/money';
import type { Transfer } from '../lib/split';
import type { Bill } from '../lib/types';
import { findBank, transferNote } from '../lib/vietqr';
import { BankTransfer } from './BankTransfer';

export function PayCard({ bill, t, baseUrl }: { bill: Bill; t: Transfer; baseUrl: string }) {
  const to = bill.p[t.to];
  const bank = to.b ? { bin: to.b[0], accountNo: to.b[1], accountName: to.b[2] } : null;

  if (!bank) {
    return (
      <div class="card">
        <p>
          Chuyển <strong>{formatVnd(t.amount)}</strong> cho <strong>{to.n}</strong>
        </p>
        <p class="error">Người nhận chưa có thông tin ngân hàng.</p>
      </div>
    );
  }

  return (
    <div class="card">
      <p>
        Chuyển <strong>{formatVnd(t.amount)}</strong> cho <strong>{to.n}</strong>
      </p>
      <p class="muted">
        {findBank(bank.bin)?.shortName ?? bank.bin} • {bank.accountNo} • {bank.accountName}
      </p>
      <BankTransfer bank={bank} amount={t.amount} note={transferNote(bill.d, bill.p[t.from].n)} baseUrl={baseUrl} />
    </div>
  );
}
