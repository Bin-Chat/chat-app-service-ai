import { Module } from '@nestjs/common';

import { KafkaModule } from '../kafka/kafka.module';

import { ModerationConsumer } from './moderation.consumer';
import { ModerationService } from './moderation.service';

@Module({
  imports: [KafkaModule],
  controllers: [ModerationConsumer],
  providers: [ModerationService],
})
export class ModerationModule {}
