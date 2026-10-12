import { formatVnd } from '../lib/money';
import { carryLine, expenseLine, transferLine } from '../lib/message';
import type { Settlement, Transfer } from '../lib/split';
import type { Bill } from '../lib/types';

export function SettlementView({
  bill,
  s,
  onDefer,
}: {
  bill: Bill;
  s: Settlement;
  onDefer?: (t: Transfer, deferred: boolean) => void;
}) {
  const transferList = (list: Transfer[], deferred: boolean) =>
    onDefer ? (
      <ul class="list">
        {list.map((t, i) => (
          <li key={`${t.from}-${t.to}-${i}`}>
            <span>{transferLine(bill, t)}</span>
            {deferred ? (
              <button type="button" onClick={() => onDefer(t, false)}>Chuyển luôn</button>
            ) : (
              <button type="button" class="neutral" onClick={() => onDefer(t, true)}>Để lần sau</button>
            )}
          </li>
        ))}
      </ul>
    ) : (
      <ul>
        {list.map((t, i) => (
          <li key={`${t.from}-${t.to}-${i}`}>{transferLine(bill, t)}</li>
        ))}
      </ul>
    );

  return (
    <div class="settlement">
      <p>
        <strong>Tổng: {formatVnd(s.total)}</strong>
      </p>
      <ul>
        {bill.e.map((_, i) => (
          <li key={i}>{expenseLine(bill, i)}</li>
        ))}
      </ul>
      {bill.a && bill.a.length > 0 && (
        <>
          <h3>Nợ lần trước</h3>
          <ul>
            {bill.a.map((c, i) => (
              <li key={i}>{carryLine(bill, c)}</li>
            ))}
          </ul>
        </>
      )}
      <table>
        <thead>
          <tr>
            <th>Tên</th>
            <th>Suất</th>
            <th>Phần phải trả</th>
            <th>Đã ứng</th>
          </tr>
        </thead>
        <tbody>
          {bill.p.map((p, i) => (
            <tr key={i}>
              <td>{p.n}</td>
              <td>{p.w}</td>
              <td>{formatVnd(s.shares[i])}</td>
              <td>{s.paid[i] === 0 ? '–' : formatVnd(s.paid[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Chuyển khoản</h3>
      {s.transfers.length === 0 ? <p>Không ai cần chuyển khoản.</p> : transferList(s.transfers, false)}
      {s.deferred.length > 0 && (
        <>
          <h3>Để lần sau</h3>
          <p class="hint">Cộng vào lần chơi sau.</p>
          {transferList(s.deferred, true)}
        </>
      )}
      {(s.transfers.length > 0 || s.deferred.length > 0) && (
        <p class="hint">Số tiền chuyển đã làm tròn lên 1.000đ.</p>
      )}
    </div>
  );
}
