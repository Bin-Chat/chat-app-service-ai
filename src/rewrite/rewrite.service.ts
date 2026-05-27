import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface RewriteVariant {
  style: string;
  label: string;
  text: string;
}

const STYLES: { style: string; label: string; instruction: string }[] = [
  {
    style: 'formal',
    label: '🎩 Trang trọng',
    instruction: 'Viết lại câu này theo phong cách trang trọng, lịch sự, phù hợp giao tiếp công việc.',
  },
  {
    style: 'casual',
    label: '😊 Thân thiện',
    instruction: 'Viết lại câu này theo phong cách thân thiện, gần gũi, tự nhiên như nói chuyện bạn bè.',
  },
  {
    style: 'concise',
    label: '⚡ Ngắn gọn',
    instruction: 'Viết lại câu này thật ngắn gọn, súc tích, giữ đúng ý chính, bỏ hết phần thừa.',
  },
  {
    style: 'detailed',
    label: '📝 Chi tiết hơn',
    instruction: 'Viết lại câu này đầy đủ và rõ ràng hơn, bổ sung thêm chi tiết nếu cần.',
  },
  {
    style: 'professional',
    label: '💼 Chuyên nghiệp',
    instruction: 'Viết lại câu này theo phong cách chuyên nghiệp, phù hợp email hoặc báo cáo công việc.',
  },
];

@Injectable()
export class RewriteService {
  private readonly logger = new Logger(RewriteService.name);
  private openai: OpenAI;

  constructor(private config: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
  }

  async rewrite(text: string): Promise<RewriteVariant[]> {
    // Build a single prompt that returns all 5 styles at once for efficiency
    const prompt = `Bạn là chuyên gia viết lại văn bản. Hãy viết lại câu/đoạn sau đây theo ${STYLES.length} phong cách khác nhau.

Câu gốc: "${text}"

Hãy trả về JSON hợp lệ (chỉ JSON, không có text nào khác) theo định dạng:
{
  "formal": "<phong cách trang trọng, lịch sự, phù hợp công việc>",
  "casual": "<phong cách thân thiện, gần gũi như nói chuyện bạn bè>",
  "concise": "<ngắn gọn, súc tích, giữ đúng ý chính>",
  "detailed": "<đầy đủ, rõ ràng hơn, bổ sung thêm chi tiết>",
  "professional": "<chuyên nghiệp, phù hợp email hoặc báo cáo>"
}

Giữ nguyên ngôn ngữ gốc của câu. Mỗi phong cách phải thực sự khác nhau về văn phong.`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'Bạn là trợ lý viết lại văn bản. Chỉ trả về JSON hợp lệ theo yêu cầu.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 800,
      temperature: 0.7,
    });

    const raw = completion.choices[0].message.content ?? '{}';

    // Parse JSON response
    let parsed: Record<string, string>;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      this.logger.warn('Failed to parse rewrite JSON response, using raw text');
      parsed = {};
    }

    return STYLES.map((s) => ({
      style: s.style,
      label: s.label,
      text: parsed[s.style] || text,
    }));
  }
}
