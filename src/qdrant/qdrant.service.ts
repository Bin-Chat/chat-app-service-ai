import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';

export const COLLECTION_MESSAGES = 'binchat_messages';
export const COLLECTION_DOCUMENTS = 'binchat_documents';
export const EMBEDDING_DIM = 1536; // text-embedding-3-small

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private client: QdrantClient;

  constructor(private config: ConfigService) {}

  // Initialize Qdrant client and ensure collections exist
  async onModuleInit() {
    const url = this.config.get<string>('QDRANT_URL', 'http://qdrant:6333');
    this.client = new QdrantClient({ url });
    await this.ensureCollections();
  }

  // Check if collections exist, create if not
  private async ensureCollections() {
    const collections = [COLLECTION_MESSAGES, COLLECTION_DOCUMENTS];
    for (const name of collections) {
      try {
        // Try to get collection info; if it doesn't exist, an error will be thrown
        await this.client.getCollection(name);
        this.logger.log(`Collection '${name}' already exists`);
      } catch {
        // Collection doesn't exist, create it
        await this.client.createCollection(name, {
          vectors: { size: EMBEDDING_DIM, distance: 'Cosine' },
        });
        this.logger.log(`Created collection '${name}'`);
      }
    }
  }

  // Upsert points into a collection
  async upsertPoints(
    collection: string,
    points: Array<{ id: string; vector: number[]; payload: Record<string, any> }>
  ) {
    await this.client.upsert(collection, {
      wait: true,
      points: points.map((p) => ({
        id: p.id,
        vector: p.vector,
        payload: p.payload,
      })),
    });
  }

  // Search for points in a collection
  async search(collection: string, vector: number[], limit = 5, filter?: Record<string, any>) {
    const params: any = { vector, limit, with_payload: true };
    if (filter) params.filter = filter;
    return this.client.search(collection, params);
  }

  // Delete points from a collection by ID
  async deletePoints(collection: string, ids: string[]) {
    await this.client.delete(collection, {
      wait: true,
      points: ids,
    });
  }
}
