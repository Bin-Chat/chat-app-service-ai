import { Controller, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventPattern, Payload } from '@nestjs/microservices';

import { AgentService } from './agent.service';

interface MessageCreatedEvent {
  messageId: string;
  conversationId: string;
  senderId: string;
  participants: string[];
  content: string;
  type: string;
  attachments?: unknown[];
  createdAt: string | Date;
}

const BOT_MENTION_RE = /(?:^|\s)@bot\b/i;

/**
 * Listens for new messages and triggers the AI agent when a message mentions @bot.
 * No need to add the bot as a conversation participant.
 */
@Controller()
export class AgentConsumer {
  private readonly logger = new Logger(AgentConsumer.name);
  private readonly botUserId: string;

  constructor(
    private readonly config: ConfigService,
    private readonly agent: AgentService
  ) {
    this.botUserId = this.config.get<string>('BOT_USER_ID', 'binchat-ai-bot');
  }

  @EventPattern('chat.message.created')
  async handleMessageCreated(@Payload() event: MessageCreatedEvent): Promise<void> {
    if (!event) return;
    if (event.senderId === this.botUserId || event.senderId === 'system') return;
    if (event.type !== 'text') return;
    const content = (event.content ?? '').trim();
    if (!content) return;

    // Trigger only when the message explicitly mentions @bot
    if (!BOT_MENTION_RE.test(content)) return;

    // Strip the @bot prefix so the agent receives the clean intent
    const userMessage = content.replace(/@bot\s*/gi, '').trim();
    if (!userMessage) return;

    try {
      await this.agent.run({
        userId: event.senderId,
        conversationId: event.conversationId,
        userMessage,
      });
    } catch (err: any) {
      this.logger.error(`Agent failed for message ${event.messageId}: ${err?.message ?? err}`);
    }
  }
}
