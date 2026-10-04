import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { RuleBasedFallback } from './rule-based-fallback';
import { GroqProvider } from './groq.provider';

@Module({
  providers: [AiService, GroqProvider, RuleBasedFallback],
  exports: [AiService],
})
export class AiModule {}
