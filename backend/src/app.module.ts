import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from './ai/ai.module';
import { AnalysisModule } from './analysis/analysis.module';
import { AuthModule } from './auth/auth.module';
import { DecisionModule } from './decision/decision.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RecommendationModule } from './recommend/recommendation.module';
import { SituationsModule } from './situations/situations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AiModule,
    SituationsModule,
    DecisionModule,
    AnalysisModule,
    RecommendationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
