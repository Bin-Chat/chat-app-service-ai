import { Module } from '@nestjs/common';

import { RewriteController } from './rewrite.controller';
import { RewriteService } from './rewrite.service';

@Module({
  controllers: [RewriteController],
  providers: [RewriteService],
  exports: [RewriteService],
})
export class RewriteModule {}
