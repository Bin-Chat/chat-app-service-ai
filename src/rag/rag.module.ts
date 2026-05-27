import { Module } from '@nestjs/common';

import { QdrantModule } from '../qdrant/qdrant.module';

import { DocumentIndexerService } from './document-indexer.service';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';

@Module({
  imports: [QdrantModule],
  controllers: [RagController],
  providers: [RagService, DocumentIndexerService],
  exports: [DocumentIndexerService, RagService],
})
export class RagModule {}
