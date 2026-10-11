import { Module } from '@nestjs/common';
import { DecisionContextController } from './decision-context.controller';
import { DecisionParserService } from './parser.service';

@Module({
  controllers: [DecisionContextController],
  providers: [DecisionParserService],
  exports: [DecisionParserService],
})
export class DecisionModule {}
