import { decodeBill } from './lib/bill';
import type { Bill } from './lib/types';
import { BillView } from './components/BillView';
import { Creator } from './components/Creator';

export function App() {
  const baseUrl = location.origin + location.pathname;
  const b = new URLSearchParams(location.search).get('b');
  if (b === null) return <Creator baseUrl={baseUrl} />;

  let bill: Bill;
  try {
    bill = decodeBill(b);
  } catch {
    return (
      <main>
        <p class="error">Link chia tiền không hợp lệ hoặc bị cắt mất.</p>
        <a class="btn" href={baseUrl}>Tạo buổi mới</a>
      </main>
    );
  }
  return <BillView bill={bill} baseUrl={baseUrl} />;
}
