import { useEffect, useState } from 'preact/hooks';
import { isIos } from '../lib/vietqr';

type InstallPromptEvent = Event & { prompt: () => Promise<void> };

// Bắt sự kiện ngay khi nạp module: Chrome có thể phát trước khi component mount.
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
  listeners.forEach((f) => f());
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  listeners.forEach((f) => f());
});

export function InstallButton() {
  const [prompt, setPrompt] = useState(deferred);
  const [iosHint, setIosHint] = useState(false);
  useEffect(() => {
    const f = () => setPrompt(deferred);
    listeners.add(f);
    f();
    return () => {
      listeners.delete(f);
    };
  }, []);

  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return null;

  if (prompt) {
    return (
      <div class="install">
        <button
          type="button"
          class="primary"
          onClick={() => {
            void prompt.prompt();
            deferred = null; // mỗi sự kiện chỉ prompt được một lần
            listeners.forEach((f) => f());
          }}
        >
          Cài app
        </button>
      </div>
    );
  }
  if (!isIos(navigator.userAgent)) return null;
  return (
    <div class="install">
      <button type="button" onClick={() => setIosHint((v) => !v)}>
        Cài app
      </button>
      {iosHint && (
        <p class="hint">
          Mở trang này bằng Safari → bấm nút Chia sẻ → chọn “Thêm vào MH chính”. Đang ở Messenger/Zalo thì chọn ⋯ → Mở bằng
          trình duyệt trước.
        </p>
      )}
    </div>
  );
}
