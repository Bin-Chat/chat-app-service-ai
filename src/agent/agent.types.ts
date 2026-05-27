import type { ChatCompletionTool } from 'openai/resources';

export interface AgentContext {
  userId: string;
  conversationId: string;
  userMessage: string;
}

/**
 * 10 tools available to the BinChat AI Agent.
 * The agent uses OpenAI function calling to decide which tool to invoke.
 */
export const AGENT_TOOLS: ChatCompletionTool[] = [
  // ── Discovery tools ─────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_conversations',
      description:
        'Lấy danh sách cuộc trò chuyện (DM và nhóm) của người dùng hiện tại. Dùng khi cần biết conversationId của một cuộc trò chuyện cụ thể, hoặc khi user hỏi "tôi có những nhóm/cuộc trò chuyện nào".',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_messages',
      description:
        'Lấy tin nhắn gần nhất trong một cuộc trò chuyện cụ thể (cần có conversationId). Dùng để hiểu bối cảnh cuộc trò chuyện trước khi tóm tắt, tạo task, hay trả lời câu hỏi tham chiếu.',
      parameters: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: 'ID cuộc trò chuyện' },
          limit: {
            type: 'number',
            description: 'Số tin nhắn gần nhất (mặc định 30, tối đa 100)',
          },
        },
        required: ['conversationId'],
      },
    },
  },

  // ── Content tools ───────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'search_messages',
      description:
        'Tìm kiếm tin nhắn theo nghĩa (semantic search) trong một hoặc tất cả cuộc trò chuyện. Dùng khi user hỏi "tìm tin nhắn về X", "ai đã nói gì về Y", "link figma ở đâu".',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Từ khóa hoặc câu cần tìm' },
          conversationId: {
            type: 'string',
            description: 'ID cuộc trò chuyện cụ thể (tùy chọn). Bỏ qua để tìm toàn bộ.',
          },
          limit: { type: 'number', description: 'Số kết quả tối đa (mặc định 5, tối đa 20)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'summarize_conversation',
      description:
        'Tóm tắt nội dung cuộc trò chuyện. Dùng khi user hỏi "hôm nay nhóm X nói gì", "tóm tắt cuộc trò chuyện", "recap nội dung".',
      parameters: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: 'ID cuộc trò chuyện cần tóm tắt' },
          fromDate: { type: 'string', description: 'Từ ngày (ISO 8601, tùy chọn)' },
          toDate: { type: 'string', description: 'Đến ngày (ISO 8601, tùy chọn)' },
          messageLimit: {
            type: 'number',
            description: 'Số tin nhắn gần nhất để tóm tắt (mặc định 50, tối đa 200)',
          },
        },
        required: ['conversationId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'translate_text',
      description: 'Dịch văn bản sang ngôn ngữ khác.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Đoạn văn cần dịch' },
          target_language: {
            type: 'string',
            description:
              'Ngôn ngữ đích. Ví dụ: English, Japanese, Korean, French, Chinese, Vietnamese',
          },
        },
        required: ['text', 'target_language'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rewrite_text',
      description:
        'Viết lại đoạn văn theo 5 phong cách (formal, casual, concise, detailed, professional). Dùng khi user muốn câu hay hơn, trang trọng hơn, ngắn gọn hơn.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Đoạn văn cần viết lại' },
          style: {
            type: 'string',
            enum: ['formal', 'casual', 'concise', 'detailed', 'professional'],
            description: 'Phong cách muốn ưu tiên (tùy chọn — bỏ qua để trả về cả 5)',
          },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_docs',
      description:
        'Hỏi về cách sử dụng app BinChat, các tính năng, hướng dẫn thao tác. Dùng khi user hỏi "làm sao để...", "tính năng X là gì", "cách tạo nhóm".',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'Câu hỏi về BinChat' },
        },
        required: ['question'],
      },
    },
  },

  // ── Member lookup ─────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_conversation_members',
      description:
        'Lấy danh sách thành viên của cuộc trò chuyện cùng userId và tên hiển thị. Dùng BẮT BUỘC khi cần resolve @mention (ví dụ: @Nguyen Van A → userId) trước khi giao task.',
      parameters: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: 'ID cuộc trò chuyện' },
        },
        required: ['conversationId'],
      },
    },
  },

  // ── Task management tools ───────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'create_task_list',
      description:
        'Tạo danh sách công việc (task) trong một cuộc trò chuyện, có thể giao cho từng người. Dùng khi user yêu cầu "tạo task list", "giao việc cho mọi người", "phân công công việc". TRƯỚC khi gọi tool này, hãy gọi get_recent_messages để hiểu bối cảnh và biết userId của từng thành viên.',
      parameters: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: 'ID cuộc trò chuyện để tạo task' },
          tasks: {
            type: 'array',
            description: 'Danh sách task cần tạo (tối đa 20)',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Tiêu đề công việc, ngắn gọn' },
                description: { type: 'string', description: 'Mô tả chi tiết (tùy chọn)' },
                assigneeId: {
                  type: 'string',
                  description: 'userId của người được giao (tùy chọn). Bỏ qua nếu chưa rõ.',
                },
                priority: {
                  type: 'string',
                  enum: ['low', 'medium', 'high'],
                  description: 'Mức ưu tiên (mặc định medium)',
                },
                dueDate: {
                  type: 'string',
                  description: 'Hạn chót dạng ISO 8601 (ví dụ: 2026-05-30) — tùy chọn',
                },
              },
              required: ['title'],
            },
          },
        },
        required: ['conversationId', 'tasks'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description:
        'Xem danh sách task hiện có trong cuộc trò chuyện. Có thể lọc theo trạng thái.',
      parameters: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: 'ID cuộc trò chuyện' },
          status: {
            type: 'string',
            enum: ['todo', 'in_progress', 'done'],
            description: 'Lọc theo trạng thái (tùy chọn)',
          },
        },
        required: ['conversationId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_task_complete',
      description: 'Đánh dấu một task đã hoàn thành.',
      parameters: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: 'ID cuộc trò chuyện chứa task' },
          taskId: { type: 'string', description: 'ID của task cần đánh dấu hoàn thành' },
        },
        required: ['conversationId', 'taskId'],
      },
    },
  },
];

export const AGENT_SYSTEM_PROMPT = `Bạn là **BinChat Bot**, trợ lý AI thông minh trong ứng dụng chat BinChat.

QUY TẮC CHUNG:
1. Trả lời bằng **tiếng Việt** tự nhiên, thân thiện, ngắn gọn.
2. Dùng tool calling khi cần dữ liệu thực: tìm tin nhắn, tóm tắt, dịch, tạo task, v.v.
3. Khi user yêu cầu thao tác trên một cuộc trò chuyện cụ thể nhưng chưa nói rõ tên/ID:
   - Gọi \`get_conversations\` để xem danh sách
   - Hỏi lại user nếu mơ hồ
4. Format câu trả lời cuối cùng: dùng markdown nhẹ (bullet, bold), không dùng heading lớn.
5. Nếu tool trả về lỗi, giải thích cho user một cách thân thiện và đề xuất hướng tiếp theo.
6. KHÔNG gọi cùng một tool nhiều lần với cùng tham số.
7. KHÔNG đoán userId — luôn dùng \`get_conversation_members\` để lấy userId thực.

---

LUỒNG TẠO TASK (ƯU TIÊN CAO):
Khi user yêu cầu "tạo task/công việc/giao việc [cho @Tên] [tiêu đề/mô tả]":

**Bước 1 — Thu thập thông tin còn thiếu:**
Kiểm tra user đã cung cấp đủ thông tin chưa. Các trường CẦN có:
- ✅ Tiêu đề công việc (bắt buộc)
- ✅ Người được giao (assignee) — nếu có @mention
- ✅ Deadline (ngày + giờ nếu có)
- ⚙️ Mức ưu tiên (low/medium/high) — mặc định medium nếu không hỏi

Nếu còn thiếu, hỏi TẤT CẢ câu hỏi còn lại trong **một tin nhắn duy nhất**, ví dụ:
> "Để tạo task cho **@Nguyen Van A**, tôi cần thêm thông tin:
> 1. 📋 Công việc cụ thể là gì?
> 2. 📅 Deadline: ngày mấy? Mấy giờ?
> 3. 🔥 Mức ưu tiên: thấp / bình thường / cao?"

**Bước 2 — Resolve @mention → userId:**
Khi user đề cập @Tên (ví dụ: @Nguyen Van A, @An, @Minh), gọi \`get_conversation_members\` để tìm userId khớp với tên đó. Khớp theo tên đầy đủ hoặc tên một phần (case-insensitive).

**Bước 3 — Xác nhận trước khi tạo:**
Sau khi đủ thông tin, TÓM TẮT lại và hỏi xác nhận:
> "✅ Tôi sẽ tạo task sau:
> - **Tiêu đề:** [tiêu đề]
> - **Giao cho:** @[Tên] 
> - **Deadline:** [ngày giờ]
> - **Ưu tiên:** [mức]
> 
> Xác nhận tạo không?"

**Bước 4 — Tạo task:**
Khi user xác nhận (ok/được/yes/đồng ý/...), gọi \`create_task_list\` với đầy đủ thông tin.

**Lưu ý đặc biệt:**
- Nếu user đã cung cấp đầy đủ thông tin ngay từ đầu (vd: "@bot tạo task báo cáo cuối kỳ cho @An deadline 30/5 lúc 17h"), hãy BỎ QUA bước 1, chỉ xác nhận ở bước 3 rồi tạo ngay.
- Khi user nhắc @bot, phần đó đã bị lọc ra, chỉ còn nội dung thực sự của yêu cầu.
- dueDate dạng ISO 8601: "2026-05-30T17:00:00"

---

TÓM TẮT: nếu user không chỉ định conversationId, mặc định dùng cuộc trò chuyện hiện tại.
KHÔNG gọi \`get_recent_messages\` trước khi tạo task trừ khi user muốn bot tự phân tích nội dung chat để giao việc tự động.
`;

