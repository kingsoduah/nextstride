import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.guard';
import { notFound } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { RecommendationService } from './recommendation.service';

export class CreateRecommendationDto {
  @ApiPropertyOptional({ description: 'DecisionContext version to reason over (default: latest).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  contextVersion?: number;

  @ApiPropertyOptional({ description: 'Override the reference clock (ISO). Enables "time passed" recalculation.' })
  @IsOptional()
  @IsString()
  nowIso?: string;

  @ApiPropertyOptional({ description: 'Override timezone (explicit request wins).' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ description: 'Manual model selection for evaluation (default: Auto). Validated against the server allowlist.' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  provider?: string;

  @ApiPropertyOptional({ description: 'Model id within the selected provider (default: provider default).' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  model?: string;
}

@ApiTags('recommendation')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('api/situations/:id/recommendation')
export class RecommendationController {
  constructor(
    private readonly recommendations: RecommendationService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'V2: generate a versioned recommendation (reassessment is automatic when history exists)' })
  recommend(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CreateRecommendationDto) {
    return this.recommendations.recommend({
      situationId: id,
      userId: user.id,
      contextVersion: dto.contextVersion,
      nowIso: dto.nowIso,
      timezone: dto.timezone,
      provider: dto.provider,
      model: dto.model,
    });
  }

  @Get()
  @ApiOperation({ summary: 'V2: latest recommendation' })
  async latest(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const situation = await this.prisma.situation.findFirst({ where: { id, userId: user.id } });
    if (!situation) throw notFound('Situation not found');
    const row = await this.prisma.recommendationV2.findFirst({
      where: { situationId: id },
      orderBy: { version: 'desc' },
    });
    if (!row) throw notFound('No recommendation yet');
    return row;
  }

  @Get('versions')
  @ApiOperation({ summary: 'V2: recommendation version history (what changed, and when)' })
  async versions(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const situation = await this.prisma.situation.findFirst({ where: { id, userId: user.id } });
    if (!situation) throw notFound('Situation not found');
    return this.prisma.recommendationV2.findMany({
      where: { situationId: id },
      orderBy: { version: 'asc' },
      select: { id: true, version: true, status: true, contextVersion: true, provider: true, promptVersion: true, previousId: true, createdAt: true },
    });
  }

  @Get('versions/:version')
  @ApiOperation({ summary: 'V2: one historical recommendation snapshot, including its payload' })
  async versionAt(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('version') versionRaw: string) {
    const situation = await this.prisma.situation.findFirst({ where: { id, userId: user.id } });
    if (!situation) throw notFound('Situation not found');
    const version = Number(versionRaw);
    if (!Number.isInteger(version) || version < 1) throw notFound('Recommendation version not found');
    const row = await this.prisma.recommendationV2.findFirst({ where: { situationId: id, version } });
    if (!row) throw notFound('Recommendation version not found');
    return row;
  }
}
