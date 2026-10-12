import { useState } from 'preact/hooks';
import { copyText } from '../lib/clipboard';
import { formatVnd } from '../lib/money';
import { loadBankApp, saveBankApp } from '../lib/storage';
import type { Transfer } from '../lib/split';
import type { Bill } from '../lib/types';
import {
  bankAppLink,
  bankAppsForPlatform,
  findBank,
  isMobile,
  qrImageUrl,
  transferNote,
} from '../lib/vietqr';

function CopyRow({ label, value }: { label: string; value: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const onCopy = async () => {
    setState((await copyText(value)) ? 'ok' : 'fail');
    setTimeout(() => setState('idle'), 2000);
  };
  return (
    <div class="copy-row">
      <label>
        <span>{label}</span>
        <input readOnly value={value} onFocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
      </label>
      <button type="button" onClick={onCopy}>
        {state === 'ok' ? 'Đã copy' : state === 'fail' ? 'Giữ để copy' : 'Copy'}
      </button>
    </div>
  );
}

export function PayCard({ bill, t, baseUrl }: { bill: Bill; t: Transfer; baseUrl: string }) {
  const to = bill.p[t.to];
  const bank = to.b ? { bin: to.b[0], accountNo: to.b[1], accountName: to.b[2] } : null;
  const ua = navigator.userAgent;
  const mobile = isMobile(ua);
  const apps = mobile ? bankAppsForPlatform(ua) : [];
  const [appId, setAppId] = useState(() => {
    const saved = loadBankApp();
    if (saved && apps.some((a) => a.appId === saved)) return saved;
    return apps.find((a) => a.autofill)?.appId ?? apps[0]?.appId ?? '';
  });

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

  const note = transferNote(bill.d, bill.p[t.from].n);
  const qrUrl = qrImageUrl(bank, t.amount, note);
  const app = apps.find((a) => a.appId === appId);
  const link = app ? bankAppLink(app.appId, bank, t.amount, note, baseUrl) : null;

  return (
    <div class="card">
      <p>
        Chuyển <strong>{formatVnd(t.amount)}</strong> cho <strong>{to.n}</strong>
      </p>
      <p class="muted">
        {findBank(bank.bin)?.shortName ?? bank.bin} • {bank.accountNo} • {bank.accountName}
      </p>
      <a href={qrUrl} target="_blank" rel="noreferrer">
        <img class="qr" src={qrUrl} width="270" alt="Mã VietQR" />
      </a>
      {mobile ? (
        <div class="open-app">
          <select
            aria-label="App ngân hàng"
            value={appId}
            onChange={(e) => {
              const v = (e.currentTarget as HTMLSelectElement).value;
              setAppId(v);
              saveBankApp(v);
            }}
          >
            <optgroup label="Tự điền sẵn">
              {apps.filter((a) => a.autofill).map((a) => (
                <option key={a.appId} value={a.appId}>{a.appName}</option>
              ))}
            </optgroup>
            <optgroup label="Chỉ mở app">
              {apps.filter((a) => !a.autofill).map((a) => (
                <option key={a.appId} value={a.appId}>{a.appName}</option>
              ))}
            </optgroup>
          </select>
          {link && app && (
            <a class="btn" href={link}>
              Mở {app.appName}
            </a>
          )}
          {app && !app.autofill && (
            <p class="hint">
              App này chưa tự điền: bấm giữ ảnh QR → Lưu ảnh, rồi trong app chọn Quét QR → chọn ảnh.
            </p>
          )}
          <p class="hint">Bấm không mở được app? Chọn ⋯ → Mở bằng trình duyệt rồi thử lại.</p>
        </div>
      ) : (
        <p class="hint">
          Mở link này trên điện thoại để mở app ngân hàng, hoặc quét QR bằng app ngân hàng.
        </p>
      )}
      <CopyRow label="Số TK" value={bank.accountNo} />
      <CopyRow label="Số tiền" value={String(t.amount)} />
      <CopyRow label="Nội dung" value={note} />
    </div>
  );
}
