import { createHash } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';

import { EmbeddingService } from '../qdrant/embedding.service';
import { QdrantService, COLLECTION_MESSAGES } from '../qdrant/qdrant.service';

export interface IndexedMessage {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: string;
  revokedAt?: string | null;
}

@Injectable()
export class MessageIndexerService {
  private readonly logger = new Logger(MessageIndexerService.name);

  constructor(
    private qdrantService: QdrantService,
    private embeddingService: EmbeddingService
  ) {}

  /** Convert any string ID (e.g. MongoDB ObjectId) to Qdrant-compatible UUID v4 format */
  private toUUID(id: string): string {
    const hash = createHash('sha256').update(id).digest('hex').slice(0, 32);
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
  }

  async indexMessage(message: IndexedMessage): Promise<void> {
    if (!message.content?.trim() || message.revokedAt) return;

    try {
      const vector = await this.embeddingService.embedText(message.content);
      await this.qdrantService.upsertPoints(COLLECTION_MESSAGES, [
        {
          id: this.toUUID(message.messageId),
          vector,
          payload: {
            messageId: message.messageId,
            conversationId: message.conversationId,
            senderId: message.senderId,
            content: message.content,
            timestamp: message.timestamp,
            isRevoked: false,
          },
        },
      ]);
    } catch (error) {
      this.logger.error(`Failed to index message ${message.messageId}: ${error.message}`);
    }
  }

  async removeMessage(messageId: string): Promise<void> {
    try {
      await this.qdrantService.deletePoints(COLLECTION_MESSAGES, [this.toUUID(messageId)]);
    } catch (error) {
      this.logger.error(`Failed to remove message ${messageId} from index: ${error.message}`);
    }
  }
}
