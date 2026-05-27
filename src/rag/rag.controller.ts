import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

import { DocumentIndexerService } from './document-indexer.service';
import { RagService } from './rag.service';

class AskDto {
  @IsString()
  @IsNotEmpty()
  question: string;

  @IsOptional()
  @IsString()
  collectionId?: string;
}

class IndexDocumentDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsString()
  collectionId?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  title?: string;
}

@Controller('ai')
export class RagController {
  constructor(
    private ragService: RagService,
    private documentIndexerService: DocumentIndexerService
  ) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'AI Service', timestamp: new Date().toISOString() };
  }

  @Post('ask')
  async ask(@Body() body: AskDto) {
    const answer = await this.ragService.ask(body.question, body.collectionId);
    return { answer, question: body.question };
  }

  @Post('documents/index')
  async indexDocument(@Body() body: IndexDocumentDto) {
    const result = await this.documentIndexerService.indexDocument(body.text, {
      collectionId: body.collectionId,
      source: body.source,
      title: body.title,
    });
    return { message: 'Document indexed successfully', ...result };
  }
}
