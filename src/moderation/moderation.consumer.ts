import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';

import { KafkaProducerService } from '../kafka/kafka-producer.service';

import { ModerationService } from './moderation.service';

interface ChatMessageSentEvent {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  timestamp: string;
}

@Controller()
export class ModerationConsumer {
  private readonly logger = new Logger(ModerationConsumer.name);

  constructor(
    private readonly moderationService: ModerationService,
    private readonly kafkaProducer: KafkaProducerService
  ) {}

  // Listen for new chat messages to moderate
  @EventPattern('chat.message.created')
  async handleMessageSent(@Payload() event: ChatMessageSentEvent): Promise<void> {
    // Skip moderation for bot-generated messages
    if (event.senderId === 'binchat-ai-bot') return;
    // Only moderate text messages
    if (event.type !== 'text' || !event.content?.trim()) return;

    this.logger.log(`Moderating message ${event.messageId}`);

    try {
      const result = await this.moderationService.moderate(event.content);

      if (result.flagged) {
        this.logger.warn(
          `Message ${event.messageId} flagged. Severity: ${result.severity}. Categories: ${JSON.stringify(result.categories)}`
        );

        await this.kafkaProducer.emit('ai.message.moderated', {
          messageId: event.messageId,
          conversationId: event.conversationId,
          senderId: event.senderId,
          flagged: true,
          categories: result.categories,
          categoryScores: result.categoryScores,
          severity: result.severity,
          reason: result.reason,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.logger.error(`Moderation failed for message ${event.messageId}: ${error.message}`);
    }
  }
}
