import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionMessageToolCall } from 'openai/resources';

import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { RedisService } from '../redis/redis.service';

import { AgentToolsService } from './agent-tools.service';
import { AGENT_SYSTEM_PROMPT, AGENT_TOOLS, AgentContext } from './agent.types';

const MAX_ITERATIONS = 5;
const MODEL = 'gpt-4o-mini';
/** Max user+assistant turns to keep in Redis context window */
const MAX_HISTORY_TURNS = 6;
/** 30-minute idle timeout — context resets after inactivity */
const HISTORY_TTL_SECONDS = 30 * 60;

export const AGENT_EVENTS = {
  BOT_REPLY: 'agent.bot_reply',
  TYPING: 'agent.typing',
};

@Injectable()
export class AgentService implements OnModuleInit {
  private readonly logger = new Logger(AgentService.name);
  private openai!: OpenAI;
  private botUserId!: string;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: AgentToolsService,
    private readonly kafka: KafkaProducerService,
    private readonly redis: RedisService
  ) {}

  onModuleInit() {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
    this.botUserId = this.config.get<string>('BOT_USER_ID', 'binchat-ai-bot');
  }

  /**
   * Handle a user message addressed to the bot.
   * Emits `agent.typing` events around the work, and `agent.bot_reply` with the final answer.
   */
  async run(ctx: AgentContext): Promise<void> {
    this.logger.log(
      `Agent run: userId=${ctx.userId} conv=${ctx.conversationId} msg="${ctx.userMessage.slice(0, 80)}"`
    );
    await this.emitTyping(ctx.conversationId, true);
    try {
      // Load conversation history from Redis (last N turns)
      const historyKey = `agent:history:${ctx.conversationId}`;
      const raw = await this.redis.get(historyKey);
      const history: Array<{ role: 'user' | 'assistant'; content: string }> = raw
        ? JSON.parse(raw)
        : [];

      const reply = await this.runAgentLoop(ctx, history);

      // Persist updated history (trim to MAX_HISTORY_TURNS pairs)
      history.push({ role: 'user', content: ctx.userMessage });
      history.push({ role: 'assistant', content: reply });
      const trimmed = history.slice(-(MAX_HISTORY_TURNS * 2));
      await this.redis.set(historyKey, JSON.stringify(trimmed), HISTORY_TTL_SECONDS);

      await this.kafka.emit(AGENT_EVENTS.BOT_REPLY, {
        conversationId: ctx.conversationId,
        botUserId: this.botUserId,
        content: reply,
      });
    } catch (err: any) {
      this.logger.error(`Agent failed: ${err?.message ?? err}`);
      await this.kafka.emit(AGENT_EVENTS.BOT_REPLY, {
        conversationId: ctx.conversationId,
        botUserId: this.botUserId,
        content: '⚠️ Xin lỗi, tôi đang gặp sự cố khi xử lý yêu cầu. Bạn thử lại sau ít phút nhé!',
      });
    } finally {
      await this.emitTyping(ctx.conversationId, false);
    }
  }

  private async emitTyping(conversationId: string, isTyping: boolean) {
    try {
      await this.kafka.emit(AGENT_EVENTS.TYPING, {
        conversationId,
        userId: this.botUserId,
        isTyping,
      });
    } catch {
      // typing is best-effort
    }
  }

  private async runAgentLoop(
    ctx: AgentContext,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<string> {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: AGENT_SYSTEM_PROMPT },
      {
        role: 'system',
        content: `Bối cảnh: userId hiện tại = "${ctx.userId}", conversationId hiện tại = "${ctx.conversationId}". Mặc định mọi thao tác trên cuộc trò chuyện này.`,
      },
      // Inject previous turns so the model has full context
      ...history,
      { role: 'user', content: ctx.userMessage },
    ];

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const completion = await this.openai.chat.completions.create({
        model: MODEL,
        messages,
        tools: AGENT_TOOLS,
        tool_choice: 'auto',
        temperature: 0.4,
      });

      const choice = completion.choices[0];
      const msg = choice.message;

      if (choice.finish_reason === 'stop' || !msg.tool_calls?.length) {
        return msg.content?.trim() || 'Mình chưa có câu trả lời, bạn thử hỏi lại nhé.';
      }

      // Append assistant message with tool_calls
      messages.push({
        role: 'assistant',
        content: msg.content ?? '',
        tool_calls: msg.tool_calls,
      });

      // Execute each tool call
      for (const call of msg.tool_calls) {
        const result = await this.executeToolCall(call, ctx.userId);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    // Final attempt without tools to force a textual answer
    const final = await this.openai.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.4,
    });
    return (
      final.choices[0].message.content?.trim() ||
      'Mình đã cố gắng nhưng chưa hoàn thành được yêu cầu này.'
    );
  }

  private async executeToolCall(
    call: ChatCompletionMessageToolCall,
    userId: string
  ): Promise<unknown> {
    if (call.type !== 'function') return { error: 'unsupported tool type' };
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function.arguments || '{}');
    } catch {
      return { error: 'Invalid JSON arguments' };
    }
    return this.tools.execute(call.function.name, args, userId);
  }
}
