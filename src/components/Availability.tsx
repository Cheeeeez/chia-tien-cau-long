import { freeCourts, nearbySlots } from '../lib/availability';
import { fixedBlockError, toMinutes, type Availability as AvailabilityResult } from '../lib/booking';
import { formatDate } from '../lib/text';
import { ShotViewer } from './ShotViewer';

const COLS = 38; // 05:00–24:00, mỗi cột 30 phút
const FIRST_MINUTE = 300;
/** Nhãn giờ thưa (mỗi 3 giờ) để vừa bề ngang điện thoại: [nhãn, số cột nó trải]. */
const HEADER: [string, number][] = [['5h', 6], ['8h', 6], ['11h', 6], ['14h', 6], ['17h', 6], ['20h', 6], ['23h', 2]];

const p2 = (n: number) => String(n).padStart(2, '0');

interface Props {
  result: AvailabilityResult;
  /** Khung giờ đang chọn trong form; lọc tại chỗ nên đổi giờ không cần hỏi lại máy chủ. */
  start: string;
  end: string;
  onPick: (court: number, start: string, end: string) => void;
  onPickSlot: (start: string, end: string) => void;
}

export function Availability({ result, start, end, onPick, onPickSlot }: Props) {
  const s = toMinutes(start);
  const e = toMinutes(end);
  const valid = e > s && !fixedBlockError(start, end);
  const courts = valid ? freeCourts(result.free, start, end) : [];
  const nearby = valid && courts.length === 0 ? nearbySlots(result.free, start, end) : [];
  const checked = new Date(result.checkedAt);

  const inRange = (col: number) => valid && FIRST_MINUTE + col * 30 >= s && FIRST_MINUTE + col * 30 < e;
  const summary = valid
    ? courts.length > 0
      ? `Sân trống ${start}–${end}: ${courts.map((c) => `sân ${c}`).join(', ')}.`
      : `Không còn sân trống ${start}–${end}.`
    : 'Khung giờ chưa hợp lệ.';

  return (
    <div class="card avail">
      <p>
        Ngày {formatDate(result.date)} · {valid ? `${start}–${end}` : 'chọn khung giờ hợp lệ'}
        <span class="muted"> · cập nhật lúc {p2(checked.getHours())}:{p2(checked.getMinutes())}</span>
      </p>

      {valid &&
        (courts.length > 0 ? (
          <ul class="list avail-courts">
            {courts.map((c) => (
              <li>
                <span>C.Lông {c}</span>
                <button type="button" class="primary" onClick={() => onPick(c, start, end)}>
                  Đặt sân này
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <p class="error" role="status">Không còn sân trống trọn khung {start}–{end}.</p>
            {nearby.length > 0 ? (
              <>
                <p class="hint">Khung gần nhất còn sân:</p>
                <div class="stack-actions avail-nearby">
                  {nearby.map((n) => (
                    <button type="button" onClick={() => onPickSlot(n.start, n.end)}>
                      {n.start}–{n.end} · còn sân {n.courts.join(', ')}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p class="hint">Cũng không có khung nào gần đó còn sân.</p>
            )}
          </>
        ))}

      <div class="avail-grid" role="img" aria-label={summary}>
        <span />
        <div class="avail-head" style={{ gridTemplateColumns: HEADER.map(([, n]) => `${n}fr`).join(' ') }}>
          {HEADER.map(([t]) => (
            <span>{t}</span>
          ))}
        </div>
        {result.free.map((row, i) => (
          <>
            <span class="avail-court">{i + 1}</span>
            <div class="avail-row" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
              {row.map((free, col) => (
                <span class={`avail-cell ${free ? 'free' : 'busy'}${inRange(col) ? ' sel' : ''}`} />
              ))}
            </div>
          </>
        ))}
      </div>
      <p class="hint avail-legend">
        <span class="avail-cell free" /> trống <span class="avail-cell busy" /> đã đặt <span class="avail-cell free sel" /> khung đang chọn
      </p>
      <p class="hint">
        Trống theo bảng lịch Alobo; Alobo vẫn có thể từ chối khung vi phạm quy định khoảng cách giữa các ca.
      </p>
      <ShotViewer src={result.screenshot} alt="Bảng lịch Alobo" />
    </div>
  );
}
