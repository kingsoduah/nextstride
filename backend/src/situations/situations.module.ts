import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SituationsController } from './situations.controller';
import { SituationsService } from './situations.service';

@Module({
  imports: [AiModule],
  controllers: [SituationsController],
  providers: [SituationsService],
})
export class SituationsModule {}
