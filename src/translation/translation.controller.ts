import { Body, Controller, Post } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

import { TranslationService } from './translation.service';

class TranslateDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsString()
  @IsNotEmpty()
  targetLanguage: string;

  @IsOptional()
  @IsString()
  sourceLanguage?: string;
}

@Controller('ai')
export class TranslationController {
  constructor(private translationService: TranslationService) {}

  @Post('translate')
  async translate(@Body() body: TranslateDto) {
    const translated = await this.translationService.translate(
      body.text,
      body.targetLanguage,
      body.sourceLanguage
    );
    return {
      original: body.text,
      translated,
      targetLanguage: body.targetLanguage,
    };
  }
}
