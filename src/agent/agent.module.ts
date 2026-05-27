import { Module } from '@nestjs/common';

import { KafkaModule } from '../kafka/kafka.module';
import { RagModule } from '../rag/rag.module';
import { RedisModule } from '../redis/redis.module';
import { RewriteModule } from '../rewrite/rewrite.module';
import { SearchModule } from '../search/search.module';
import { SummaryModule } from '../summary/summary.module';
import { TranslationModule } from '../translation/translation.module';

import { AgentToolsService } from './agent-tools.service';
import { AgentConsumer } from './agent.consumer';
import { AgentService } from './agent.service';

@Module({
  imports: [
    KafkaModule,
    RedisModule,
    SearchModule,
    SummaryModule,
    TranslationModule,
    RewriteModule,
    RagModule,
  ],
  controllers: [AgentConsumer],
  providers: [AgentService, AgentToolsService],
})
export class AgentModule {}
