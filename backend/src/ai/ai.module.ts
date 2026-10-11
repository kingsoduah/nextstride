import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { RuleBasedFallback } from './rule-based-fallback';

@Module({
  // Note: GroqProvider/OpenRouterProvider/GeminiProvider are instantiated
  // manually by the provider registry (per-request model selection), never
  // DI-injected.
  providers: [AiService, RuleBasedFallback],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}
