import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

import { RagService } from '../rag/rag.service';
import { RewriteService } from '../rewrite/rewrite.service';
import { SearchService } from '../search/search.service';
import { SummaryService } from '../summary/summary.service';
import { TranslationService } from '../translation/translation.service';

interface ToolError {
  error: string;
}

@Injectable()
export class AgentToolsService {
  private readonly logger = new Logger(AgentToolsService.name);
  private readonly http: AxiosInstance;
  private readonly chatServiceUrl: string;
  private readonly userServiceUrl: string;
  private readonly serviceSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly searchService: SearchService,
    private readonly summaryService: SummaryService,
    private readonly translationService: TranslationService,
    private readonly rewriteService: RewriteService,
    private readonly ragService: RagService
  ) {
    this.chatServiceUrl = this.config.get<string>(
      'CHAT_SERVICE_URL',
      'http://chat-service:3040'
    );
    this.userServiceUrl = this.config.get<string>(
      'USER_SERVICE_URL',
      'http://user-service:3020'
    );
    this.serviceSecret = this.config.get<string>(
      'INTERNAL_SERVICE_SECRET',
      'internal-secret'
    );
    this.http = axios.create({
      timeout: 15_000,
      headers: { 'x-service-secret': this.serviceSecret },
    });
  }

  /**
   * Dispatch a tool call by name. Always returns a JSON-serializable result.
   * Errors are caught and returned as `{ error: string }` so the model can recover.
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    userId: string
  ): Promise<unknown> {
    this.logger.log(`Tool call: ${toolName} args=${JSON.stringify(args).slice(0, 200)}`);
    try {
      switch (toolName) {
        case 'get_conversations':
          return await this.getConversations(userId);
        case 'get_conversation_members':
          return await this.getConversationMembersTool(String(args.conversationId));
        case 'get_recent_messages':
          return await this.getRecentMessages(
            userId,
            String(args.conversationId),
            Number(args.limit ?? 30)
          );
        case 'search_messages':
          return await this.searchMessagesTool(
            String(args.query),
            args.conversationId ? String(args.conversationId) : undefined,
            Math.min(Number(args.limit ?? 5), 20)
          );
        case 'summarize_conversation':
          return await this.summarizeConversationTool(
            userId,
            String(args.conversationId),
            args.fromDate ? String(args.fromDate) : undefined,
            args.toDate ? String(args.toDate) : undefined,
            Math.min(Number(args.messageLimit ?? 50), 200)
          );
        case 'translate_text':
          return await this.translateTool(
            String(args.text),
            String(args.target_language)
          );
        case 'rewrite_text':
          return await this.rewriteTool(
            String(args.text),
            args.style ? String(args.style) : undefined
          );
        case 'ask_docs':
          return await this.askDocsTool(String(args.question));
        case 'create_task_list':
          return await this.createTaskListTool(
            userId,
            String(args.conversationId),
            args.tasks as unknown[]
          );
        case 'list_tasks':
          return await this.listTasksTool(
            userId,
            String(args.conversationId),
            args.status ? String(args.status) : undefined
          );
        case 'mark_task_complete':
          return await this.markTaskCompleteTool(
            userId,
            String(args.conversationId),
            String(args.taskId)
          );
        default:
          return { error: `Unknown tool: ${toolName}` };
      }
    } catch (err: any) {
      this.logger.error(`Tool ${toolName} failed: ${err?.message ?? err}`);
      return { error: err?.message ?? 'Internal error' } as ToolError;
    }
  }

  // ── HTTP helpers ──────────────────────────────────────────────────────

  private async getConversations(userId: string) {
    const { data } = await this.http.get(`${this.chatServiceUrl}/api/chat/internal/conversations`, {
      params: { userId },
    });
    // Return a slim view to keep token usage low
    return (data as any[]).slice(0, 30).map((c) => ({
      id: c._id,
      type: c.type,
      name: c.name,
      participantIds: (c.participants ?? []).map((p: any) => p.userId),
      lastMessage: c.lastMessage?.content?.slice(0, 100) ?? '',
      lastMessageAt: c.lastMessage?.sentAt ?? c.updatedAt,
    }));
  }

  private async getConversationMembersTool(conversationId: string) {
    const { data: participants } = await this.http.get(
      `${this.chatServiceUrl}/api/chat/internal/conversations/${conversationId}/members`
    );

    const memberList = participants as { userId: string; role: string }[];
    // Filter out bot user — resolve real user names via user service
    const humanIds = memberList
      .map((m) => m.userId)
      .filter((id) => id !== 'binchat-ai-bot');

    // Batch-fetch profiles from user service (internal endpoint, no JWT needed)
    let profileMap: Record<string, { fullName: string; avatar?: string }> = {};
    if (humanIds.length > 0) {
      try {
        const { data: profiles } = await this.http.post(
          `${this.userServiceUrl}/api/users/internal/batch`,
          { userIds: humanIds }
        );
        for (const p of profiles as { id: string; fullName: string; avatar?: string }[]) {
          profileMap[p.id] = { fullName: p.fullName, avatar: p.avatar };
        }
      } catch (err: unknown) {
        this.logger.warn(`Could not enrich member profiles: ${(err as Error).message}`);
      }
    }

    return memberList.map((m) => ({
      userId: m.userId,
      name: profileMap[m.userId]?.fullName ?? m.userId,
      role: m.role ?? 'member',
    }));
  }

  private async getRecentMessages(userId: string, conversationId: string, limit: number) {
    const { data } = await this.http.get(
      `${this.chatServiceUrl}/api/chat/internal/conversations/${conversationId}/messages`,
      { params: { userId, limit: Math.min(limit, 100) } }
    );
    // data should be an array of messages (newest first from chat service)
    const messages = Array.isArray(data) ? data : data.messages ?? [];
    return messages.slice(0, limit).map((m: any) => ({
      messageId: m._id,
      senderId: m.senderId,
      type: m.type,
      content: (m.content ?? '').slice(0, 500),
      createdAt: m.createdAt,
    }));
  }

  // ── Direct service tools ──────────────────────────────────────────────

  private async searchMessagesTool(
    query: string,
    conversationId: string | undefined,
    limit: number
  ) {
    const results = await this.searchService.searchMessages(query, conversationId, limit);
    return results.map((r) => ({
      messageId: r.messageId,
      conversationId: r.conversationId,
      senderId: r.senderId,
      content: r.content.slice(0, 300),
      timestamp: r.timestamp,
      score: r.score,
    }));
  }

  private async summarizeConversationTool(
    userId: string,
    conversationId: string,
    fromDate: string | undefined,
    toDate: string | undefined,
    messageLimit: number
  ) {
    // 1. Fetch messages from chat service
    const raw = await this.getRecentMessages(userId, conversationId, messageLimit);
    if (raw.length === 0) {
      return { summary: 'Cuộc trò chuyện chưa có tin nhắn nào.' };
    }
    // 2. Map to summary service format
    const messages = raw
      .filter((m) => m.type === 'text' && m.content)
      .reverse() // oldest first
      .map((m) => ({
        senderId: m.senderId,
        content: m.content,
        timestamp: m.createdAt,
      }));
    if (messages.length === 0) {
      return { summary: 'Không có tin nhắn văn bản để tóm tắt.' };
    }
    const summary = await this.summaryService.summarizeConversation(
      conversationId,
      messages,
      fromDate,
      toDate
    );
    return { summary, messageCount: messages.length };
  }

  private async translateTool(text: string, targetLanguage: string) {
    const translated = await this.translationService.translate(text, targetLanguage);
    return { translated, targetLanguage };
  }

  private async rewriteTool(text: string, style?: string) {
    const variants = await this.rewriteService.rewrite(text);
    if (style) {
      const match = variants.find((v) => v.style === style);
      if (match) return { variant: match };
    }
    return { variants };
  }

  private async askDocsTool(question: string) {
    const answer = await this.ragService.ask(question);
    return { answer };
  }

  // ── Task tools ────────────────────────────────────────────────────────

  private async createTaskListTool(
    userId: string,
    conversationId: string,
    tasks: unknown[]
  ) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return { error: 'tasks phải là mảng không rỗng' };
    }
    const { data } = await this.http.post(
      `${this.chatServiceUrl}/api/chat/internal/tasks`,
      { conversationId, createdBy: userId, tasks: tasks.slice(0, 20) }
    );
    return {
      created: Array.isArray(data) ? data.length : 0,
      tasks: (data as any[]).map((t) => ({
        id: t._id,
        title: t.title,
        assigneeId: t.assigneeId,
        priority: t.priority,
        dueDate: t.dueDate,
      })),
    };
  }

  private async listTasksTool(userId: string, conversationId: string, status?: string) {
    const { data } = await this.http.get(`${this.chatServiceUrl}/api/chat/internal/tasks`, {
      params: { userId, conversationId, status },
    });
    return (data as any[]).map((t) => ({
      id: t._id,
      title: t.title,
      status: t.status,
      assigneeId: t.assigneeId,
      priority: t.priority,
      dueDate: t.dueDate,
    }));
  }

  private async markTaskCompleteTool(userId: string, conversationId: string, taskId: string) {
    const { data } = await this.http.post(
      `${this.chatServiceUrl}/api/chat/internal/tasks/${taskId}/complete`,
      {},
      { params: { userId, conversationId } }
    );
    return { ok: true, task: { id: (data as any)._id, status: (data as any).status } };
  }
}
