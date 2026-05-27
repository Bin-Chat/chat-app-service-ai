import { Module } from '@nestjs/common';

import { RedisModule } from '../redis/redis.module';

import { SummaryController } from './summary.controller';
import { SummaryService } from './summary.service';

@Module({
  imports: [RedisModule],
  controllers: [SummaryController],
  providers: [SummaryService],
  exports: [SummaryService],
})
export class SummaryModule {}
