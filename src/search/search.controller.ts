import { Body, Controller, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { IndexedMessage, MessageIndexerService } from './message-indexer.service';
import { SearchService } from './search.service';

class SearchDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  minScore?: number;
}

class ReindexMessageDto {
  @IsString() messageId: string;
  @IsString() conversationId: string;
  @IsString() senderId: string;
  @IsString() content: string;
  @IsString() timestamp: string;
  @IsOptional()
  @IsString()
  revokedAt?: string;
}

class ReindexDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReindexMessageDto)
  messages: ReindexMessageDto[];
}

@Controller('ai')
export class SearchController {
  constructor(
    private searchService: SearchService,
    private messageIndexerService: MessageIndexerService
  ) {}

  @Post('search')
  async search(@Body() body: SearchDto) {
    const results = await this.searchService.searchMessages(
      body.query,
      body.conversationId,
      body.limit ?? 10,
      body.minScore // undefined → service picks dynamic threshold
    );
    return { results, total: results.length, query: body.query };
  }

  /** Backfill: index a batch of existing messages into Qdrant for semantic search */
  @Post('messages/reindex')
  async reindex(@Body() body: ReindexDto) {
    let indexed = 0;
    let failed = 0;
    for (const msg of body.messages) {
      try {
        await this.messageIndexerService.indexMessage(msg as IndexedMessage);
        indexed++;
      } catch {
        failed++;
      }
    }
    return { indexed, failed, total: body.messages.length };
  }
}
