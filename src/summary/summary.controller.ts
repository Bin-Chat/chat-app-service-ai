import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SummaryService } from './summary.service';

class MessageItemDto {
  @IsString()
  @IsNotEmpty()
  senderId: string;

  @IsOptional()
  @IsString()
  senderName?: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  timestamp: string;
}

class SummarizeDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MessageItemDto)
  messages: MessageItemDto[];

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}

@Controller('ai/conversations')
export class SummaryController {
  constructor(private summaryService: SummaryService) {}

  @Post(':id/summary')
  async summarize(@Param('id') conversationId: string, @Body() body: SummarizeDto) {
    const summary = await this.summaryService.summarizeConversation(
      conversationId,
      body.messages,
      body.fromDate,
      body.toDate,
    );
    return {
      conversationId,
      summary,
      fromDate: body.fromDate ?? null,
      toDate: body.toDate ?? null,
      messageCount: body.messages.length,
    };
  }
}
