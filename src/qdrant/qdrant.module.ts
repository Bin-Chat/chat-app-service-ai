import { Module } from '@nestjs/common';

import { EmbeddingService } from './embedding.service';
import { QdrantService } from './qdrant.service';

@Module({
  providers: [QdrantService, EmbeddingService],
  exports: [QdrantService, EmbeddingService],
})
export class QdrantModule {}
