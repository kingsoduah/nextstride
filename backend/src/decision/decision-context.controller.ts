import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.guard';
import { DecisionParserService } from './parser.service';
import { CreateDecisionContextDto } from './dto';
import { PrismaService } from '../prisma/prisma.service';
import { notFound } from '../common/errors';

@ApiTags('decision-context')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('api/situations/:id/decision-context')
export class DecisionContextController {
  constructor(
    private readonly parser: DecisionParserService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'V2: parse the situation into a versioned structured DecisionContext' })
  parse(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CreateDecisionContextDto) {
    return this.parser.parse({
      situationId: id,
      userId: user.id,
      timezone: dto.timezone,
      provider: dto.provider,
      model: dto.model,
    });
  }

  @Get()
  @ApiOperation({ summary: 'V2: latest DecisionContext version for the situation' })
  async latest(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const situation = await this.prisma.situation.findFirst({ where: { id, userId: user.id } });
    if (!situation) throw notFound('Situation not found');
    const row = await this.prisma.decisionContext.findFirst({
      where: { situationId: id },
      orderBy: { version: 'desc' },
    });
    if (!row) throw notFound('No decision context yet');
    return row;
  }

  @Get('versions')
  @ApiOperation({ summary: 'V2: DecisionContext version history (for reassessment + V1/V2 comparison)' })
  async versions(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const situation = await this.prisma.situation.findFirst({ where: { id, userId: user.id } });
    if (!situation) throw notFound('Situation not found');
    return this.prisma.decisionContext.findMany({
      where: { situationId: id },
      orderBy: { version: 'asc' },
      select: { id: true, version: true, timezone: true, provider: true, promptVersion: true, createdAt: true },
    });
  }
}
