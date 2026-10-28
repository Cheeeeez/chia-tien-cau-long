import { useState } from 'preact/hooks';

// Ảnh chụp gốc 1700px nhưng hiển thị vừa khung điện thoại (~380px) nên chữ rất nhỏ; viewport đã khoá pinch-zoom
// nên phóng to bằng nút, ảnh cuộn/kéo được trong khung.
const LEVELS = [1, 1.5, 2, 3, 4, 5];

export function ShotViewer({ src, alt }: { src: string; alt: string }) {
  const [level, setLevel] = useState(0);
  return (
    <div class="shot-viewer">
      <div class="row-actions">
        <button type="button" aria-label="Thu nhỏ" disabled={level === 0} onClick={() => setLevel(level - 1)}>
          −
        </button>
        <span class="muted">{Math.round(LEVELS[level] * 100)}%</span>
        <button type="button" aria-label="Phóng to" disabled={level === LEVELS.length - 1} onClick={() => setLevel(level + 1)}>
          +
        </button>
        <button type="button" class="neutral" disabled={level === 0} onClick={() => setLevel(0)}>
          Vừa khung
        </button>
      </div>
      <div class="shot-scroll">
        <img class="shot" src={src} alt={alt} style={{ width: `${LEVELS[level] * 100}%` }} />
      </div>
    </div>
  );
}
