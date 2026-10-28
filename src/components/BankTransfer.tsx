import { useEffect, useState } from 'preact/hooks';
import { copyText } from '../lib/clipboard';
import { loadBankApp, saveBankApp } from '../lib/storage';
import type { BankInfo } from '../lib/types';
import { bankAppLink, bankAppsForPlatform, isIos, isMobile, qrImageUrl, resolveIosDeeplink } from '../lib/vietqr';
import { fetchImageFile, saveImageFile } from '../lib/saveImage';

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

/**
 * Phần chuyển khoản dùng chung: ảnh QR (lưu được), mở app ngân hàng điền sẵn số tiền + nội dung, và các ô copy.
 * Trả về nhiều phần tử rời để chèn thẳng vào một `.card`. `qrSrc`: ảnh QR có sẵn; thiếu thì tạo VietQR từ tài khoản/số tiền/nội dung.
 */
export function BankTransfer({
  bank,
  amount,
  note,
  baseUrl,
  qrSrc,
}: {
  bank: BankInfo;
  amount: number;
  note: string;
  baseUrl: string;
  qrSrc?: string;
}) {
  const ua = navigator.userAgent;
  const mobile = isMobile(ua);
  const apps = mobile ? bankAppsForPlatform(ua) : [];
  const [appId, setAppId] = useState(() => {
    const saved = loadBankApp();
    if (saved && apps.some((a) => a.appId === saved)) return saved;
    return apps.find((a) => a.autofill)?.appId ?? apps[0]?.appId ?? '';
  });
  const app = apps.find((a) => a.appId === appId);
  const link = app ? bankAppLink(app.appId, bank, amount, note, baseUrl) : null;
  const ios = isIos(ua);
  const [direct, setDirect] = useState<{ from: string; href: string } | null>(null);

  // iOS: dl.vietqr.io chỉ trả trang tự chuyển hướng bằng JS (webview như Messenger hay chặn),
  // nên lấy sẵn deeplink thật để cú bấm của người dùng mở app trực tiếp.
  useEffect(() => {
    if (!ios || !link) return;
    let ctrl = new AbortController();
    const run = () => {
      ctrl.abort();
      const c = (ctrl = new AbortController());
      resolveIosDeeplink(link, c.signal).then((href) => {
        if (!c.signal.aborted) setDirect(href ? { from: link, href } : null);
      });
    };
    // Chữ ký deeplink có timestamp nên lấy lại mỗi khi trang hiện lại.
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    run();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      ctrl.abort();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ios, link]);
  const href = direct && direct.from === link ? direct.href : link;

  // Tải sẵn ảnh QR: share() trên iOS phải chạy ngay trong cú bấm, không chờ mạng được.
  const qrUrl = qrSrc ?? qrImageUrl(bank, amount, note);
  const [qrFile, setQrFile] = useState<{ from: string; file: File | null } | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'ok' | 'fail'>('idle');
  useEffect(() => {
    const ctrl = new AbortController();
    fetchImageFile(qrUrl, `vietqr-${note.replace(/\s+/g, '-')}.png`, ctrl.signal).then((file) => {
      if (!ctrl.signal.aborted) setQrFile({ from: qrUrl, file });
    });
    return () => ctrl.abort();
  }, [qrUrl, note]);
  const readyFile = qrFile && qrFile.from === qrUrl ? qrFile : null;
  const onSave = async () => {
    const r = readyFile?.file ? await saveImageFile(readyFile.file, ios) : 'fail';
    if (r === 'cancel') return;
    setSaveState(r);
    setTimeout(() => setSaveState('idle'), 2500);
  };

  const image = <img class="qr" src={qrUrl} width="270" alt="Mã QR chuyển khoản" />;
  return (
    <>
      {qrSrc ? image : <a href={qrUrl} target="_blank" rel="noreferrer">{image}</a>}
      <button type="button" class="save-qr" disabled={!readyFile} onClick={onSave}>
        {saveState === 'ok' ? 'Đã lưu ảnh' : saveState === 'fail' ? 'Không lưu được, bấm giữ ảnh QR để lưu' : 'Lưu ảnh QR'}
      </button>
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
          {href && app && (
            <a class="btn primary" href={href}>
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
      <CopyRow label="Số tiền" value={String(amount)} />
      <CopyRow label="Nội dung" value={note} />
    </>
  );
}
