import { useEffect, useState } from 'preact/hooks';
import { BookingError, createWatch, deleteWatch, listWatches, type Auth, type Watch } from '../lib/booking';
import { currentSubscription, ensureSubscription, pushSupport } from '../lib/push';
import { formatDate } from '../lib/text';

interface Props {
  auth: Auth;
  /** Khung giờ đang chọn (đã có kết quả sân trống); null thì chỉ hiện danh sách đang theo dõi. */
  candidate: { date: string; start: string; end: string } | null;
}

const support = pushSupport();

/** Theo dõi khung giờ: máy chủ đọc lại lịch Alobo định kỳ và đẩy thông báo tới điện thoại khi sắp hết sân, hết sân hoặc có sân lại. */
export function Watches({ auth, candidate }: Props) {
  const [items, setItems] = useState<Watch[]>([]);
  const [threshold, setThreshold] = useState(2);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [off, setOff] = useState(false); // máy chủ chưa bật thông báo (503)

  // 503: máy chủ chưa bật thông báo; 404: máy chủ bản cũ chưa có tính năng này. Cả hai đều ẩn mục này.
  const isOff = (e: unknown) => e instanceof BookingError && (e.status === 503 || e.status === 404);
  const fail = (e: unknown) => {
    if (isOff(e)) setOff(true);
    setNote({ ok: false, text: e instanceof BookingError ? e.message : 'Lỗi không xác định' });
  };

  async function refresh() {
    const sub = await currentSubscription();
    setItems(sub ? await listWatches(auth, sub.endpoint) : []);
  }

  // Chỉ nạp danh sách khi mở màn và khi có khung để theo dõi (nghĩa là vừa xem sân trống thành công, mã truy cập đúng).
  // Không nạp theo từng ký tự gõ vào ô mã: mỗi lần sai mã bị tính vào giới hạn khoá IP của máy chủ.
  const hasCandidate = candidate !== null;
  useEffect(() => {
    if (support !== 'ok' || auth.code.trim() === '') return;
    refresh().catch((e) => {
      if (isOff(e)) setOff(true);
    });
  }, [hasCandidate]);

  if (off || (!candidate && items.length === 0)) return null;

  async function watch() {
    if (!candidate) return;
    setBusy(true);
    setNote(null);
    try {
      const subscription = await ensureSubscription(auth);
      const r = await createWatch(auth, { subscription, ...candidate, threshold });
      await refresh();
      const now =
        r.courts === null
          ? ''
          : r.courts.length === 0
            ? ' Hiện đã hết sân, sẽ báo khi có sân trống lại.'
            : ` Hiện còn ${r.courts.length} sân.${r.courts.length <= threshold ? ' Thông báo sẽ đến trong vài giây.' : ''}`;
      setNote({ ok: true, text: `Đã bật theo dõi ${candidate.start}–${candidate.end} ngày ${formatDate(candidate.date)}.${now}` });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setNote(null);
    try {
      const sub = await currentSubscription();
      if (sub) await deleteWatch(auth, id, sub.endpoint);
      await refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="card watches">
      {candidate && (
        <>
          <p>
            <strong>🔔 Theo dõi khung {candidate.start}–{candidate.end}</strong>
          </p>
          {support === 'ok' ? (
            <>
              <label class="field">
                <span>Báo khi còn ít hơn hoặc bằng</span>
                <select value={String(threshold)} onChange={(e) => setThreshold(Number((e.target as HTMLSelectElement).value))}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option value={String(n)}>{n} sân</option>
                  ))}
                </select>
              </label>
              <button type="button" class="primary" disabled={busy} onClick={watch}>
                Theo dõi khung này
              </button>
              <p class="hint">
                Khung đang còn ít hơn hoặc bằng số sân đã chọn thì báo ngay. Sau đó cũng báo khi sân giảm xuống ngưỡng, hết sân và khi có sân
                trống lại; máy chủ kiểm tra định kỳ nên các thông báo này có thể trễ vài phút.
              </p>
            </>
          ) : support === 'needs-install' ? (
            <p class="hint">
              Trên iPhone cần thêm app vào màn hình chính (Safari → Chia sẻ → “Thêm vào MH chính”) rồi mở app từ đó mới nhận được thông báo.
            </p>
          ) : (
            <p class="hint">Trình duyệt này không hỗ trợ thông báo đẩy. Hãy dùng Chrome (Android) hoặc app đã thêm vào màn hình chính (iPhone).</p>
          )}
        </>
      )}

      {note && (
        <p class={note.ok ? 'hint' : 'error'} role="status">
          {note.text}
        </p>
      )}

      {items.length > 0 && (
        <>
          <p class="hint">Đang theo dõi:</p>
          <ul class="list avail-courts">
            {items.map((w) => (
              <li>
                <span>
                  {formatDate(w.date)} · {w.start}–{w.end} · ≤ {w.threshold} sân
                </span>
                <button type="button" class="neutral" disabled={busy} onClick={() => remove(w.id)}>
                  Bỏ
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
