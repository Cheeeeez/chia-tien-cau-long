import { normalizePhone } from './intent.js';

const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const secret = process.env.SECRET_KEY ?? '';
if (secret.length < 16) die('Thiếu SECRET_KEY (cần ≥ 16 ký tự; dùng để mã hoá mật khẩu Alobo đã lưu)');

const accessCode = process.env.BOOKING_TOKEN ?? '';
if (accessCode.length < 4) die('Thiếu BOOKING_TOKEN (mã truy cập chung của nhóm, tối thiểu 4 ký tự)');

const origins = list(process.env.ALLOWED_ORIGIN);
if (origins.length === 0) die('Thiếu ALLOWED_ORIGIN (danh sách origin phân tách bằng dấu phẩy)');

// Không bắt buộc: có thì chỉ những SĐT này được đăng nhập; bỏ trống thì SĐT nào có tài khoản Alobo đều đăng nhập được
// (vẫn phải có mã truy cập và đúng mật khẩu Alobo).
const listed = list(process.env.ALLOWED_PHONES);
const phones = new Set<string>();
for (const p of listed) {
  try {
    phones.add(normalizePhone(p));
  } catch {
    die(`ALLOWED_PHONES có số không hợp lệ: ${p}`);
  }
}

export const config = {
  port: Number(process.env.PORT) || 8787,
  secretKey: secret,
  accessCode,
  allowedOrigins: origins,
  /** null = không giới hạn SĐT. */
  allowedPhones: listed.length > 0 ? phones : null,
  /** Số phiên trình duyệt chạy đồng thời; mỗi phiên tốn ~0,5–1 GB RAM. */
  maxSessions: Math.max(1, Number(process.env.MAX_SESSIONS) || 2),
  /** Tin các header X-Forwarded-For / CF-Connecting-IP (chỉ bật khi máy chủ nằm sau tunnel hoặc reverse proxy). */
  trustProxy: process.env.TRUST_PROXY === '1',
  llmApiKey: process.env.LLM_API_KEY ?? '',
  llmBaseUrl: (process.env.LLM_BASE_URL ?? 'https://api.freemodel.dev/v1').replace(/\/+$/, ''),
  llmModel: process.env.LLM_MODEL ?? 'auto',
  dataDir: process.env.DATA_DIR ?? './data',
};
