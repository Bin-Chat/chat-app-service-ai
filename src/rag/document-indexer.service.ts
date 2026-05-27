import { createHash } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';

import { EmbeddingService } from '../qdrant/embedding.service';
import { QdrantService, COLLECTION_DOCUMENTS } from '../qdrant/qdrant.service';

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 100;

@Injectable()
export class DocumentIndexerService {
  private readonly logger = new Logger(DocumentIndexerService.name);

  constructor(
    private qdrantService: QdrantService,
    private embeddingService: EmbeddingService
  ) {}

  /** Split text into overlapping chunks */
  private chunkText(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      chunks.push(text.slice(start, start + CHUNK_SIZE));
      start += CHUNK_SIZE - CHUNK_OVERLAP;
    }
    return chunks;
  }

  async indexDocument(
    text: string,
    metadata: { collectionId?: string; source?: string; title?: string }
  ): Promise<{ chunksIndexed: number }> {
    const chunks = this.chunkText(text);
    this.logger.log(`Indexing ${chunks.length} chunks for source: ${metadata.source || 'unknown'}`);

    const vectors = await this.embeddingService.embedBatch(chunks);

    const points = chunks.map((chunk, i) => ({
      id: createHash('sha256')
        .update(`${metadata.source || 'doc'}-${i}-${chunk.slice(0, 50)}`)
        .digest('hex')
        .slice(0, 32)
        // Qdrant UUID format: 8-4-4-4-12
        .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'),
      vector: vectors[i],
      payload: {
        text: chunk,
        chunkIndex: i,
        ...metadata,
      },
    }));

    await this.qdrantService.upsertPoints(COLLECTION_DOCUMENTS, points);
    return { chunksIndexed: chunks.length };
  }
}
