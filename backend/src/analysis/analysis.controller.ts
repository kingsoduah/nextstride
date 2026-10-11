import { Body, Controller, Get, Param, Post, UseGuards, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Allow, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.guard';
import { apiError, notFound } from '../common/errors';
import { DecisionContextV2Schema } from '../decision/spec';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyzeRequestSchema } from './analysis';
import { analyzeDecisionContext } from './engine';
import type { StoredResolutions } from './engine';

export class AnalyzeBodyDto {
  @ApiPropertyOptional({ description: 'Override the stored reference clock (ISO). Enables "time passed" recalculation.' })
  @IsOptional()
  @IsString()
  nowIso?: string;

  @ApiPropertyOptional({ description: 'Override timezone (explicit request wins).' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

export class AnalyzeContextBodyDto {
  @ApiPropertyOptional({ description: 'Full DecisionContextV2 object to analyze.' })
  @Allow()
  context!: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nowIso?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

@ApiTags('analysis')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('api')
export class AnalysisController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('situations/:id/analysis')
  @ApiOperation({ summary: 'V3: deterministic analysis of the latest stored DecisionContext (optional clock override)' })
  async analyzeStored(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: AnalyzeBodyDto) {
    const situation = await this.prisma.situation.findFirst({ where: { id, userId: user.id } });
    if (!situation) throw notFound('Situation not found');
    const row = await this.prisma.decisionContext.findFirst({ where: { situationId: id }, orderBy: { version: 'desc' } });
    if (!row) throw notFound('No decision context yet — parse one first');
    const parsed = DecisionContextV2Schema.safeParse(row.context);
    if (!parsed.success) throw apiError('VALIDATION_ERROR', 'Stored context is invalid', HttpStatus.UNPROCESSABLE_ENTITY);
    try {
      // No clock override → reuse the stored Phase 2 resolutions (same reference).
      const stored = dto.nowIso || dto.timezone
        ? undefined
        : (row.resolutions as unknown as StoredResolutions);
      return analyzeDecisionContext(parsed.data, { nowIso: dto.nowIso, timezone: dto.timezone }, stored);
    } catch (err) {
      throw apiError('VALIDATION_ERROR', err instanceof Error ? err.message : 'Invalid clock override', HttpStatus.BAD_REQUEST);
    }
  }

  @Post('analysis')
  @ApiOperation({ summary: 'V3: deterministic analysis of a supplied DecisionContextV2 (no persistence)' })
  analyzeSupplied(@Body() body: AnalyzeContextBodyDto) {
    const parsed = AnalyzeRequestSchema.safeParse(body);
    if (!parsed.success) throw apiError('VALIDATION_ERROR', 'Invalid request body', HttpStatus.BAD_REQUEST);
    const ctx = DecisionContextV2Schema.safeParse(parsed.data.context);
    if (!ctx.success) throw apiError('VALIDATION_ERROR', 'Invalid DecisionContextV2', HttpStatus.UNPROCESSABLE_ENTITY);
    try {
      return analyzeDecisionContext(ctx.data, { nowIso: parsed.data.nowIso, timezone: parsed.data.timezone });
    } catch (err) {
      throw apiError('VALIDATION_ERROR', err instanceof Error ? err.message : 'Invalid clock override', HttpStatus.BAD_REQUEST);
    }
  }

  @Get('situations/:id/analysis/versions')
  @ApiOperation({ summary: 'V3: list stored decision contexts available for analysis' })
  async versions(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const situation = await this.prisma.situation.findFirst({ where: { id, userId: user.id } });
    if (!situation) throw notFound('Situation not found');
    return this.prisma.decisionContext.findMany({
      where: { situationId: id },
      orderBy: { version: 'asc' },
      select: { version: true, timezone: true, provider: true, createdAt: true },
    });
  }
}
