import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';

import { MessageIndexerService } from './message-indexer.service';

interface ChatMessageSentEvent {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  createdAt?: string;
  timestamp?: string;
}

interface ChatMessageRevokedEvent {
  messageId: string;
}

@Controller()
export class MessageIndexConsumer {
  private readonly logger = new Logger(MessageIndexConsumer.name);

  constructor(private readonly messageIndexerService: MessageIndexerService) {}

  // Subscribe to chat message created events for search indexing
  @EventPattern('chat.message.created')
  async handleMessageForIndexing(@Payload() event: ChatMessageSentEvent): Promise<void> {
    if (event.type !== 'text' || !event.content?.trim()) return;

    this.logger.debug(`Indexing message ${event.messageId} for search`);
    await this.messageIndexerService.indexMessage({
      messageId: event.messageId,
      conversationId: event.conversationId,
      senderId: event.senderId,
      content: event.content,
      timestamp: event.createdAt ?? event.timestamp ?? new Date().toISOString(),
    });
  }

  @EventPattern('chat.message.revoked')
  async handleRevokedMessage(@Payload() event: ChatMessageRevokedEvent): Promise<void> {
    if (!event?.messageId) return;
    await this.messageIndexerService.removeMessage(event.messageId);
  }
}
