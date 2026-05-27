import { Body, Controller, Post } from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { RewriteService } from './rewrite.service';

class RewriteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;
}

@Controller('ai')
export class RewriteController {
  constructor(private rewriteService: RewriteService) {}

  @Post('rewrite')
  async rewrite(@Body() body: RewriteDto) {
    const rewrites = await this.rewriteService.rewrite(body.text);
    return { original: body.text, rewrites };
  }
}
