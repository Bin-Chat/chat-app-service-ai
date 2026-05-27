import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { RedisService } from '../redis/redis.service';

const CACHE_TTL = 3600; // 1 hour

@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);
  private openai: OpenAI;

  constructor(
    private config: ConfigService,
    private redisService: RedisService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
  }

  async summarizeConversation(
    conversationId: string,
    messages: Array<{ senderId: string; senderName?: string; content: string; timestamp: string }>,
    fromDate?: string,
    toDate?: string,
  ): Promise<string> {
    // Filter by date range if specified
    let filtered = messages;
    if (fromDate || toDate) {
      const from = fromDate ? new Date(fromDate).getTime() : 0;
      const to = toDate ? new Date(toDate).getTime() + 86400000 : Infinity; // include full end day
      filtered = messages.filter((m) => {
        const t = new Date(m.timestamp).getTime();
        return t >= from && t <= to;
      });
    }

    if (filtered.length === 0) {
      return 'Không có tin nhắn nào trong khoảng thời gian đã chọn.';
    }

    const dateRangeKey = fromDate && toDate ? `${fromDate}_${toDate}` : 'all';
    const cacheKey = `ai:summary:${conversationId}:${filtered.length}:${dateRangeKey}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for summary of conversation ${conversationId}`);
      return cached;
    }

    const messageText = filtered
      .map((m) => {
        const time = new Date(m.timestamp).toLocaleString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        const name = m.senderName || m.senderId;
        return `[${time}] ${name}: ${m.content}`;
      })
      .join('\n');

    const firstMsg = filtered[0];
    const lastMsg = filtered[filtered.length - 1];
    const firstDate = new Date(firstMsg.timestamp).toLocaleDateString('vi-VN');
    const lastDate = new Date(lastMsg.timestamp).toLocaleDateString('vi-VN');
    const dateRange =
      firstDate === lastDate ? `ngày ${firstDate}` : `từ ${firstDate} đến ${lastDate}`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `Bạn là trợ lý AI chuyên nghiệp phân tích hội thoại. Tạo bản tóm tắt theo đúng cấu trúc sau (giữ nguyên các icon và tiêu đề):

📋 TỔNG QUAN
[Mô tả 1-2 câu chủ đề cuộc trò chuyện — ${filtered.length} tin nhắn, ${dateRange}]

🎯 NỘI DUNG CHÍNH
• [Điểm chính 1]
• [Điểm chính 2]
• [Điểm chính 3 nếu có]

✅ KẾT LUẬN & QUYẾT ĐỊNH
• [Kết luận hoặc quyết định đạt được, nếu không có thì ghi "Chưa có kết luận rõ ràng"]

⚡ HÀNH ĐỘNG CẦN THỰC HIỆN
• [Việc cần làm tiếp theo, nếu không có thì ghi "Không có"]

Trả lời bằng tiếng Việt. Súc tích, chuyên nghiệp. Không thêm lời mở đầu hay kết thúc thừa.`,
        },
        {
          role: 'user',
          content: `Tóm tắt cuộc trò chuyện sau:\n\n${messageText}`,
        },
      ],
      max_tokens: 800,
      temperature: 0.2,
    });

    const summary = completion.choices[0].message.content || 'Không thể tạo bản tóm tắt.';
    await this.redisService.set(cacheKey, summary, CACHE_TTL);
    return summary;
  }
}
