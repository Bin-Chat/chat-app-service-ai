import { createHash } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import { RedisService } from '../redis/redis.service';

const CACHE_TTL = 86400; // 24 hours — translations rarely change

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private openai: OpenAI;

  constructor(
    private config: ConfigService,
    private redisService: RedisService
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
  }

  async translate(text: string, targetLanguage: string, sourceLanguage?: string): Promise<string> {
    // Use a hash of the text + target language as the cache key, since the same text may be translated to multiple languages
    const cacheKey = `ai:translation:${createHash('md5').update(`${text}:${targetLanguage}`).digest('hex')}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) return cached;

    const sourceLangHint = sourceLanguage ? ` (source: ${sourceLanguage})` : '';
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the given text to ${targetLanguage}${sourceLangHint}. Return ONLY the translated text, no explanations.`,
        },
        { role: 'user', content: text },
      ],
      max_tokens: 1024,
      temperature: 0.1,
    });

    const translated = completion.choices[0].message.content || text;
    await this.redisService.set(cacheKey, translated, CACHE_TTL);
    return translated;
  }
}
