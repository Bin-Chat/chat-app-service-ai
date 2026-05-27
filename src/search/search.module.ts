import { Module } from '@nestjs/common';

import { KafkaModule } from '../kafka/kafka.module';
import { QdrantModule } from '../qdrant/qdrant.module';

import { MessageIndexConsumer } from './message-index.consumer';
import { MessageIndexerService } from './message-indexer.service';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [QdrantModule, KafkaModule],
  controllers: [SearchController, MessageIndexConsumer],
  providers: [SearchService, MessageIndexerService],
  exports: [MessageIndexerService, SearchService],
})
export class SearchModule {}
