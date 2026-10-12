import { formatVnd } from '../lib/money';
import { expenseLine, transferLine } from '../lib/message';
import type { Settlement } from '../lib/split';
import type { Bill } from '../lib/types';

export function SettlementView({ bill, s }: { bill: Bill; s: Settlement }) {
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
      {s.transfers.length === 0 ? (
        <p>Không ai cần chuyển khoản.</p>
      ) : (
        <>
          <ul>
            {s.transfers.map((t, i) => (
              <li key={i}>{transferLine(bill, t)}</li>
            ))}
          </ul>
          <p class="hint">Số tiền chuyển đã làm tròn lên 1.000đ.</p>
        </>
      )}
    </div>
  );
}
