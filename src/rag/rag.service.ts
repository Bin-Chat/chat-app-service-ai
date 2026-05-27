import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import { EmbeddingService } from '../qdrant/embedding.service';
import { QdrantService, COLLECTION_DOCUMENTS } from '../qdrant/qdrant.service';

import { DocumentIndexerService } from './document-indexer.service';

// ─── Intent types ────────────────────────────────────────────────────────────
type Intent =
  | 'greeting'
  | 'feature_usage'
  | 'ai_features'
  | 'technical'
  | 'troubleshoot'
  | 'social_features'
  | 'general';

interface IntentConfig {
  systemPrompt: string;
  docSources: string[]; // filter by payload.source in Qdrant
  temperature: number;
}

const INTENT_MAP: Record<Intent, IntentConfig> = {
  greeting: {
    systemPrompt:
      'Bạn là BinChat AI — trợ lý thông minh của ứng dụng nhắn tin BinChat. Hãy chào hỏi thân thiện, giới thiệu ngắn gọn bạn có thể giúp gì (hướng dẫn sử dụng, giải thích tính năng, hỗ trợ kỹ thuật). Trả lời bằng tiếng Việt, vui vẻ và tự nhiên.',
    docSources: [],
    temperature: 0.8,
  },
  feature_usage: {
    systemPrompt:
      'Bạn là trợ lý hướng dẫn sử dụng BinChat. Hãy giải thích cách thực hiện thao tác một cách rõ ràng, từng bước, với ngôn ngữ đơn giản. Dùng số thứ tự (1, 2, 3...) cho các bước. Trả lời bằng tiếng Việt.',
    docSources: ['binchat-guide', 'binchat-intro'],
    temperature: 0.3,
  },
  ai_features: {
    systemPrompt:
      'Bạn là chuyên gia về tính năng AI của BinChat. Giải thích chi tiết về cách hoạt động, lợi ích, và cách sử dụng các tính năng AI. Bao gồm ví dụ cụ thể khi cần. Trả lời bằng tiếng Việt.',
    docSources: ['binchat-ai', 'binchat-guide'],
    temperature: 0.4,
  },
  technical: {
    systemPrompt:
      'Bạn là kỹ sư phần mềm giải thích kiến trúc kỹ thuật của BinChat. Trả lời chính xác, có thể dùng thuật ngữ kỹ thuật, giải thích cấu trúc hệ thống, công nghệ sử dụng. Trả lời bằng tiếng Việt.',
    docSources: ['binchat-architecture'],
    temperature: 0.2,
  },
  troubleshoot: {
    systemPrompt:
      'Bạn là chuyên viên hỗ trợ kỹ thuật BinChat. Hãy chẩn đoán vấn đề, đề xuất các bước kiểm tra và khắc phục cụ thể. Hỏi thêm thông tin nếu cần. Trả lời bằng tiếng Việt, kiên nhẫn và chi tiết.',
    docSources: ['binchat-guide', 'binchat-intro'],
    temperature: 0.4,
  },
  social_features: {
    systemPrompt:
      'Bạn là trợ lý hướng dẫn tính năng xã hội của BinChat (bạn bè, nhóm, phân quyền). Giải thích rõ ràng từng bước cách thực hiện. Trả lời bằng tiếng Việt.',
    docSources: ['binchat-social', 'binchat-guide'],
    temperature: 0.3,
  },
  general: {
    systemPrompt:
      'Bạn là BinChat AI — trợ lý thông minh của ứng dụng nhắn tin BinChat. Trả lời mọi câu hỏi liên quan đến BinChat một cách hữu ích, chính xác, thân thiện bằng tiếng Việt. Nếu không biết câu trả lời, hãy thành thật nói không có thông tin và gợi ý người dùng liên hệ hỗ trợ.',
    docSources: [],
    temperature: 0.5,
  },
};

// ─── Default seeded documents ────────────────────────────────────────────────
const DEFAULT_DOCS = [
  {
    title: 'Giới thiệu BinChat',
    source: 'binchat-intro',
    text: `BinChat là ứng dụng nhắn tin thời gian thực hiện đại, hỗ trợ đa nền tảng (web và mobile). Được xây dựng trên kiến trúc microservices với NestJS và React. Hỗ trợ chat 1-1 và nhóm, gửi file/ảnh/video, cuộc gọi thoại và video, ghim tin nhắn, reply, forward, thu hồi tin nhắn trong 15 phút, react emoji, hệ thống bạn bè.`,
  },
  {
    title: 'Tính năng AI trong BinChat',
    source: 'binchat-ai',
    text: `BinChat tích hợp 6 tính năng AI: (1) Tóm tắt hội thoại — phân tích theo khoảng thời gian tùy chọn, xuất 4 phần: Tổng quan, Nội dung chính, Kết luận, Hành động cần làm. (2) Tìm kiếm ngữ nghĩa — tìm tin nhắn theo ý nghĩa dùng vector embeddings, không cần từ khóa chính xác. (3) Dịch thuật — hỗ trợ 8 ngôn ngữ, kết quả cache 24h. (4) RAG Bot — chatbot hỏi đáp thông minh về BinChat, phân loại ý định câu hỏi. (5) Kiểm duyệt nội dung — tự động qua Kafka + OpenAI Moderation. (6) Viết lại tin nhắn — 5 phong cách: Trang trọng, Thân thiện, Ngắn gọn, Chi tiết hơn, Chuyên nghiệp.`,
  },
  {
    title: 'Hướng dẫn sử dụng BinChat',
    source: 'binchat-guide',
    text: `Đăng nhập: nhập email và mật khẩu. Tạo nhóm: nhấn nút + từ màn hình chính, thêm bạn bè. Thu hồi tin nhắn: giữ vào tin nhắn → Thu hồi (trong 15 phút). Chỉnh sửa tin nhắn: giữ → Chỉnh sửa (trong 30 phút). Tìm kiếm thông minh: nhấn icon kính lúp → gõ từ khóa theo nghĩa. Tóm tắt AI: nhấn menu ≡ → chọn khoảng ngày → Tóm tắt ngay. Gửi file: nhấn icon đính kèm, chọn ảnh (10MB), video (50MB), tài liệu (20MB). Cuộc gọi: nhấn icon điện thoại/camera trong chat. Viết lại tin nhắn: nhấn icon ✨ trong thanh nhập liệu khi đang soạn tin.`,
  },
  {
    title: 'Kiến trúc kỹ thuật BinChat',
    source: 'binchat-architecture',
    text: `Microservices: auth-service (3001), user-service (3002), friend-service (3003), upload-service (3004), notification-service (3005), ai-service (3050). API Gateway (3000) proxy toàn bộ request. Database: PostgreSQL (user/friend/auth), MongoDB (messages/conversations), Redis (cache/session/pub-sub), Kafka/Redpanda (event streaming), Qdrant (vector DB cho AI), AWS S3/LocalStack (file storage). Frontend: React 18 + Vite + Tailwind CSS (web), Expo React Native + NativeWind (mobile). AI Stack: OpenAI GPT-3.5-turbo, text-embedding-3-small (1536 dims).`,
  },
  {
    title: 'Hệ thống bạn bè và nhóm',
    source: 'binchat-social',
    text: `Bạn bè: tìm kiếm user → gửi lời mời kết bạn → đối phương chấp nhận/từ chối → sau khi kết bạn có thể nhắn tin 1-1. Nhóm: tạo nhóm từ màn hình chính → thêm thành viên. Phân quyền: owner (chủ nhóm, toàn quyền), admin (quản lý thành viên, pin tin nhắn), member (nhắn tin thông thường). Tính năng nhóm: thêm/xóa thành viên, thay đổi quyền, chuyển quyền owner, giải tán nhóm, cấm thành viên, bật/tắt "Chỉ admin gửi tin nhắn". Thông báo: email khi có lời mời kết bạn.`,
  },
  {
    title: 'Xử lý sự cố thường gặp BinChat',
    source: 'binchat-troubleshoot',
    text: `Không gửi được tin nhắn: kiểm tra kết nối internet, reload trang. Không thấy tin nhắn mới: kiểm tra kết nối WebSocket (biểu tượng wifi ở góc), thử reload. File không upload được: kiểm tra kích thước (ảnh <10MB, video <50MB, tài liệu <20MB), định dạng hỗ trợ. Cuộc gọi ngắt: cần kết nối ổn định, thử tắt VPN. Tìm kiếm AI không có kết quả: chức năng tìm kiếm dựa trên vector, chỉ tìm thấy tin nhắn đã được đánh chỉ mục (tin nhắn mới từ khi hệ thống chạy). AI bot không trả lời: kiểm tra kết nối, thử hỏi lại bằng câu đơn giản hơn.`,
  },
  {
    title: 'Bảo mật và tài khoản BinChat',
    source: 'binchat-security',
    text: `Đăng nhập bảo mật: JWT access token (15 phút) + refresh token (7 ngày), lưu trong httpOnly cookie. Multi-device: tối đa 1 thiết bị web + 1 thiết bị mobile cùng lúc; đăng nhập thiết bị mới tự kick thiết bị cũ. Đăng xuất: tự động xóa token. Đổi mật khẩu: qua trang cài đặt tài khoản. Quên mật khẩu: reset qua email. Chặn người dùng: vào cài đặt → danh sách chặn.`,
  },
];

@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);
  private openai: OpenAI;

  constructor(
    private config: ConfigService,
    private qdrantService: QdrantService,
    private embeddingService: EmbeddingService,
    private documentIndexer: DocumentIndexerService
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
  }

  /** Auto-seed default BinChat documents if collection is empty */
  async onModuleInit() {
    try {
      const dummy = await this.embeddingService.embedText('ping');
      const existing = await this.qdrantService.search(COLLECTION_DOCUMENTS, dummy, 1);
      if (existing.length === 0) {
        this.logger.log('binchat_documents is empty — seeding default documents...');
        for (const doc of DEFAULT_DOCS) {
          await this.documentIndexer.indexDocument(doc.text, {
            source: doc.source,
            title: doc.title,
          });
        }
        this.logger.log(`Seeded ${DEFAULT_DOCS.length} default documents.`);
      }
    } catch (err: any) {
      this.logger.warn(`Auto-seed skipped: ${err?.message}`);
    }
  }

  /**
   * Classify the user question into one of 7 intent categories.
   * Uses a lightweight GPT call with a strict single-word response.
   */
  private async classifyIntent(question: string): Promise<Intent> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `Phân loại câu hỏi sau vào ĐÚNG MỘT trong các nhóm sau. Chỉ trả về đúng một từ khóa, không có gì thêm:
- greeting: chào hỏi, giới thiệu, hỏi về bot
- feature_usage: hướng dẫn sử dụng tính năng, cách làm gì đó
- ai_features: hỏi về các tính năng AI (tóm tắt, dịch, tìm kiếm, viết lại, bot)
- technical: kiến trúc hệ thống, công nghệ, code, database
- troubleshoot: lỗi, sự cố, không hoạt động, vấn đề kỹ thuật
- social_features: bạn bè, nhóm, thành viên, quyền, admin
- general: các câu hỏi khác về BinChat`,
          },
          { role: 'user', content: question },
        ],
        max_tokens: 10,
        temperature: 0,
      });

      const raw = (completion.choices[0].message.content || '').trim().toLowerCase();
      const validIntents: Intent[] = [
        'greeting',
        'feature_usage',
        'ai_features',
        'technical',
        'troubleshoot',
        'social_features',
        'general',
      ];
      return validIntents.includes(raw as Intent) ? (raw as Intent) : 'general';
    } catch {
      return 'general';
    }
  }

  /**
   * Search Qdrant for relevant documents.
   * If intent has docSources, prefer those; fallback to broad search.
   */
  private async retrieveDocs(
    queryVector: number[],
    intent: Intent,
    collectionId?: string
  ): Promise<any[]> {
    const cfg = INTENT_MAP[intent];

    // Build filter
    let filter: any = undefined;
    if (collectionId) {
      filter = { must: [{ key: 'collectionId', match: { value: collectionId } }] };
    } else if (cfg.docSources.length > 0) {
      filter = {
        should: cfg.docSources.map((src) => ({ key: 'source', match: { value: src } })),
      };
    }

    try {
      const results = await this.qdrantService.search(COLLECTION_DOCUMENTS, queryVector, 5, filter);
      // If filtered search returned nothing, fallback to broad search
      if (results.length === 0 && filter) {
        return await this.qdrantService.search(COLLECTION_DOCUMENTS, queryVector, 5);
      }
      return results;
    } catch {
      return [];
    }
  }

  async ask(question: string, collectionId?: string): Promise<string> {
    // 1. Classify intent (parallel with embedding)
    const [intent, queryVector] = await Promise.all([
      this.classifyIntent(question),
      this.embeddingService.embedText(question),
    ]);

    this.logger.debug(`RAG intent: ${intent} | question: "${question.slice(0, 60)}"`);

    // 2. Greeting — no doc retrieval needed
    if (intent === 'greeting') {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: INTENT_MAP.greeting.systemPrompt },
          { role: 'user', content: question },
        ],
        max_tokens: 300,
        temperature: INTENT_MAP.greeting.temperature,
      });
      return (
        completion.choices[0].message.content ||
        'Xin chào! Tôi là BinChat AI, tôi có thể giúp gì cho bạn?'
      );
    }

    // 3. Retrieve relevant documents
    const docs = await this.retrieveDocs(queryVector, intent, collectionId);
    const cfg = INTENT_MAP[intent];

    let systemPrompt = cfg.systemPrompt;
    let userContent = question;

    if (docs.length > 0) {
      const context = docs
        .map((r, i) => `[${i + 1}] ${(r.payload as any)?.text || ''}`)
        .join('\n\n');
      systemPrompt += '\n\nHãy dựa vào thông tin tài liệu sau để trả lời:\n' + context;
      userContent = `Câu hỏi: ${question}`;
    }

    // 4. Generate answer
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: 1024,
      temperature: cfg.temperature,
    });

    return completion.choices[0].message.content || 'Không thể tạo câu trả lời lúc này.';
  }
}
