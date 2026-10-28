import { config } from './config.js';
import { HttpError } from './errors.js';

const THU = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

const PROMPT = `Bạn chuyển câu lệnh đặt sân cầu lông tiếng Việt thành JSON. Hôm nay là {thu}, {today} (giờ Việt Nam).
Chỉ trả về MỘT object JSON, không giải thích: {"date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","court":<số 1-10 hoặc null>}
Quy tắc:
- Không nói ngày → hôm nay. "mai" = hôm nay + 1 ngày; "ngày kia"/"kia" = + 2 ngày. Thứ trong tuần → ngày gần nhất từ hôm nay trở đi có thứ đó.
- Giờ mặc định là dạng 24h, giữ nguyên số người dùng nói: "6-8h" = 06:00–08:00, "19h-21h" = 19:00–21:00, "13h" = 13:00. Phút chỉ 00 hoặc 30 ("rưỡi" = 30). Chỉ khi người dùng ghi rõ "chiều" hoặc "tối" và giờ từ 1 đến 11 thì cộng 12 ("6-8h tối" = 18:00–20:00). "sáng"/"trưa" thì giữ nguyên ("12h trưa" = 12:00).
- "N tiếng"/"N tiếng rưỡi" → end = start + thời lượng. "24h"/"12h đêm"/"12h tối" làm giờ kết thúc = 24:00.
- "sân 3", "sân số 3", "C.Lông 3" → court 3. Không nói sân hoặc "sân nào cũng được" → null.
- Không xác định được giờ bắt đầu hoặc giờ kết thúc → {"error":"<lý do ngắn bằng tiếng Việt>"}.`;

const invalid = () => new HttpError('AI trả về kết quả không hợp lệ', 502);

export const MAX_COMMAND_LENGTH = 200;

/** Tách câu lệnh tự nhiên thành object thô; việc kiểm tra hợp lệ do `validateIntent` làm. */
export async function parseCommand(text: string, today: string): Promise<unknown> {
  if (!config.llmApiKey) throw new HttpError('Chưa cấu hình LLM_API_KEY', 503);
  if (text.length > MAX_COMMAND_LENGTH) throw new HttpError(`Câu lệnh quá dài (tối đa ${MAX_COMMAND_LENGTH} ký tự)`, 400);
  const thu = THU[new Date(`${today}T00:00:00Z`).getUTCDay()];
  const prompt = PROMPT.replace('{thu}', thu).replace('{today}', today);

  let content: unknown;
  try {
    const res = await fetch(`${config.llmBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.llmApiKey}` },
      body: JSON.stringify({
        model: config.llmModel,
        temperature: 0,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: text },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.error('llm http', res.status, (await res.text()).slice(0, 300));
      throw invalid();
    }
    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    content = data.choices?.[0]?.message?.content;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.error('llm fetch', e);
    throw invalid();
  }
  if (typeof content !== 'string') throw invalid();

  let parsed: unknown;
  try {
    const body = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    parsed = JSON.parse(body);
  } catch {
    throw invalid();
  }
  if (parsed && typeof parsed === 'object' && typeof (parsed as { error?: unknown }).error === 'string') {
    throw new HttpError(`Không hiểu câu lệnh: ${(parsed as { error: string }).error}`, 400);
  }
  return parsed;
}
