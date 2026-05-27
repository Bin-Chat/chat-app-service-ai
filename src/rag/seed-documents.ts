/**
 * Seed script: index BinChat knowledge documents vào Qdrant
 * để RAG Bot có thể trả lời câu hỏi về ứng dụng.
 *
 * Chạy: npx ts-node -r tsconfig-paths/register src/rag/seed-documents.ts
 * hoặc gọi API: POST /api/ai/documents/index
 */
import axios from 'axios';

const BASE_URL = process.env.AI_SERVICE_URL || 'http://localhost:3050';

const BINCHAT_DOCUMENTS = [
  {
    title: 'Giới thiệu BinChat',
    source: 'binchat-intro',
    text: `BinChat là ứng dụng nhắn tin thời gian thực hiện đại, hỗ trợ đa nền tảng (web và mobile).
BinChat được xây dựng trên kiến trúc microservices với các công nghệ tiên tiến.
Người dùng có thể nhắn tin 1-1 (direct message), tạo nhóm chat, gửi file, hình ảnh, video, và thực hiện cuộc gọi thoại/video.
BinChat tích hợp trí tuệ nhân tạo (AI) để cung cấp các tính năng thông minh như tóm tắt hội thoại, tìm kiếm ngữ nghĩa, dịch thuật và chatbot hỗ trợ.`,
  },
  {
    title: 'Tính năng chính của BinChat',
    source: 'binchat-features',
    text: `Các tính năng chính của BinChat:

1. Nhắn tin thời gian thực: Gửi và nhận tin nhắn ngay lập tức qua WebSocket (Socket.IO).
2. Chat 1-1 và nhóm: Tạo hội thoại riêng tư hoặc nhóm với nhiều thành viên.
3. Gửi file đa phương tiện: Hỗ trợ gửi hình ảnh (tối đa 10MB), video (tối đa 50MB), tài liệu (tối đa 20MB).
4. Cuộc gọi thoại và video: Thực hiện cuộc gọi âm thanh và video trực tiếp trong ứng dụng.
5. Ghim tin nhắn: Ghim tin nhắn quan trọng để dễ tìm lại, hỗ trợ nhiều tin ghim cùng lúc.
6. Trả lời tin nhắn (reply): Trả lời cụ thể một tin nhắn trong cuộc trò chuyện.
7. Chuyển tiếp tin nhắn (forward): Chuyển tiếp tin nhắn sang cuộc trò chuyện khác.
8. Thu hồi và xóa tin nhắn: Thu hồi tin nhắn trong vòng 15 phút, xóa khỏi thiết bị.
9. Phản ứng emoji (reactions): React bằng emoji vào tin nhắn.
10. Hệ thống bạn bè: Gửi và nhận lời mời kết bạn, quản lý danh sách bạn bè.`,
  },
  {
    title: 'Tính năng AI trong BinChat',
    source: 'binchat-ai-features',
    text: `BinChat tích hợp AI với các tính năng sau:

1. Tóm tắt hội thoại (AI Summary): AI phân tích và tóm tắt nội dung cuộc trò chuyện theo khoảng thời gian tùy chọn. Kết quả bao gồm: Tổng quan, Nội dung chính, Kết luận & Quyết định, Hành động cần thực hiện.

2. Tìm kiếm ngữ nghĩa (Semantic Search): Tìm kiếm tin nhắn theo ý nghĩa thay vì từ khóa chính xác. Sử dụng vector embeddings để so sánh độ tương đồng. Chỉ trả về kết quả có độ phù hợp >= 65%.

3. Dịch thuật tin nhắn (Translation): Dịch nội dung tin nhắn sang ngôn ngữ khác (tiếng Anh, Pháp, Nhật, Hàn, Trung...). Kết quả được cache 24 giờ để tối ưu hiệu suất.

4. RAG Chatbot (BinChat AI Bot): Chatbot thông minh trả lời câu hỏi về cách sử dụng BinChat, dựa trên tài liệu đã được index vào hệ thống.

5. Kiểm duyệt nội dung (Content Moderation): Tự động phát hiện nội dung vi phạm trong tin nhắn qua Kafka, sử dụng OpenAI Moderation API.`,
  },
  {
    title: 'Hướng dẫn sử dụng nhóm chat',
    source: 'binchat-group-guide',
    text: `Hướng dẫn sử dụng tính năng nhóm chat trong BinChat:

Tạo nhóm: Vào màn hình chính, nhấn nút tạo nhóm, thêm thành viên từ danh sách bạn bè.
Vai trò nhóm: owner (chủ nhóm), admin (quản trị viên), member (thành viên).
Chủ nhóm có thể: đổi tên nhóm, thêm/xóa thành viên, phân quyền admin, xóa nhóm.
Admin có thể: thêm thành viên, ghim tin nhắn, cấm thành viên.
Cài đặt nhóm: Có thể bật "Chỉ admin gửi tin nhắn" hoặc "Chỉ admin ghim tin nhắn".
Thông tin nhóm: Xem danh sách thành viên, tin nhắn đã ghim, ảnh/video/file đã chia sẻ.`,
  },
  {
    title: 'Hướng dẫn gửi file và media',
    source: 'binchat-upload-guide',
    text: `Hướng dẫn gửi file và media trong BinChat:

Hình ảnh: Nhấn icon ảnh trong ô nhập tin nhắn, chọn tối đa 5 ảnh cùng lúc. Kích thước tối đa 10MB/ảnh.
Video: Nhấn icon video, chọn 1 video tối đa 50MB, thời lượng tối đa 2 phút.
Tài liệu: Nhấn icon file, chọn bất kỳ loại file. Kích thước tối đa 20MB.
File được lưu trên AWS S3 (hoặc LocalStack trong môi trường dev).
Lambda function tự động xử lý thumbnail cho ảnh và video.
Xem ảnh: Nhấn vào ảnh để xem toàn màn hình với chế độ lightbox.`,
  },
  {
    title: 'Hệ thống bạn bè BinChat',
    source: 'binchat-friend-system',
    text: `Hệ thống bạn bè trong BinChat:

Gửi lời mời kết bạn: Tìm kiếm người dùng, nhấn "Kết bạn".
Nhận lời mời: Xem tab "Lời mời kết bạn", có thể chấp nhận hoặc từ chối.
Sau khi kết bạn: Có thể bắt đầu nhắn tin 1-1, xem avatar và tên hiển thị.
Hủy kết bạn: Vào thông tin bạn bè, nhấn "Hủy kết bạn".
Thông báo: Nhận thông báo qua email khi có lời mời kết bạn (nếu bật email notifications).`,
  },
  {
    title: 'Kiến trúc kỹ thuật BinChat',
    source: 'binchat-architecture',
    text: `Kiến trúc kỹ thuật của BinChat:

Backend: Microservices với NestJS
- auth-service (port 3001): Xác thực, đăng nhập, đăng ký, JWT tokens
- user-service (port 3002): Quản lý hồ sơ người dùng
- friend-service (port 3003): Quản lý bạn bè
- upload-service (port 3004): Upload file lên S3/LocalStack
- notification-service (port 3005): Gửi email thông báo
- ai-service (port 3050): Tính năng AI (summary, search, translate, RAG, moderation)

API Gateway (port 3000): Proxy tất cả request, xác thực JWT, định tuyến WebSocket

Frontend:
- Web: React 18 + TypeScript + Vite + Tailwind CSS
- Mobile: Expo (React Native) + NativeWind

Infrastructure:
- PostgreSQL: Lưu trữ dữ liệu người dùng, bạn bè
- MongoDB: Lưu trữ tin nhắn, hội thoại
- Redis: Cache, JWT blacklist, pub/sub
- Kafka (Redpanda): Message streaming giữa services
- Qdrant: Vector database cho AI features
- AWS S3 / LocalStack: Lưu trữ file`,
  },
  {
    title: 'Trợ giúp sử dụng BinChat',
    source: 'binchat-help',
    text: `Câu hỏi thường gặp về BinChat:

Hỏi: Làm sao để đăng nhập?
Đáp: Vào trang đăng nhập, nhập email và mật khẩu đã đăng ký. Nếu chưa có tài khoản, nhấn "Đăng ký".

Hỏi: Làm sao để tạo nhóm chat?
Đáp: Từ màn hình chính, nhấn nút "+" hoặc "Tạo nhóm", thêm thành viên từ danh sách bạn bè.

Hỏi: Tin nhắn có thể thu hồi không?
Đáp: Có, bạn có thể thu hồi tin nhắn trong vòng 15 phút sau khi gửi. Nhấn giữ vào tin nhắn và chọn "Thu hồi".

Hỏi: Làm sao để tìm kiếm tin nhắn?
Đáp: Nhấn icon kính lúp trong màn hình chat để dùng AI Search — tìm kiếm theo ý nghĩa, không cần từ khóa chính xác.

Hỏi: Tính năng tóm tắt AI hoạt động thế nào?
Đáp: Nhấn icon tóm tắt (≡) trong màn hình chat, chọn khoảng thời gian cần tóm tắt, nhấn "Tóm tắt ngay". AI sẽ phân tích và trả về bản tóm tắt có cấu trúc.

Hỏi: BinChat có hỗ trợ cuộc gọi không?
Đáp: Có, BinChat hỗ trợ cuộc gọi thoại và video. Nhấn icon điện thoại hoặc camera trong màn hình chat.`,
  },
];

async function seedDocuments() {
  console.log('🚀 Bắt đầu seed tài liệu BinChat vào Qdrant...\n');

  for (const doc of BINCHAT_DOCUMENTS) {
    try {
      const response = await axios.post(
        `${BASE_URL}/api/ai/documents/index`,
        {
          text: doc.text,
          title: doc.title,
          source: doc.source,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            // Add auth token if needed in production
          },
          timeout: 30000,
        },
      );
      console.log(`✅ Indexed: "${doc.title}" → ${response.data.chunksIndexed} chunks`);
    } catch (err: any) {
      console.error(`❌ Failed: "${doc.title}" → ${err?.response?.data?.message ?? err.message}`);
    }
  }

  console.log('\n✨ Seed hoàn tất! RAG Bot có thể trả lời câu hỏi về BinChat.');
}

seedDocuments().catch(console.error);
