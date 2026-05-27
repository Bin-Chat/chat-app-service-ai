import { Module } from '@nestjs/common';

import { RedisModule } from '../redis/redis.module';

import { TranslationController } from './translation.controller';
import { TranslationService } from './translation.service';

@Module({
  imports: [RedisModule],
  controllers: [TranslationController],
  providers: [TranslationService],
  exports: [TranslationService],
})
export class TranslationModule {}
