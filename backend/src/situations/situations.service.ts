import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import type { ParsedContext } from '../ai/schemas';
import { apiError, notFound } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSituationDto, FeedbackDto, ReassessDto, UpdateSituationDto } from './dto';

const situationInclude = {
  context: { include: { responsibilities: true, conflicts: true } },
  recommendations: { orderBy: { version: 'asc' as const } },
  reassessments: { orderBy: { createdAt: 'asc' as const } },
  feedback: true,
};

function toParsedContext(row: {
  uncertainties: string[];
  responsibilities: Array<{ title: string; category: string; timeRef: string; fixedTime: boolean; flexible: boolean; delegatable: boolean; detail: string }>;
  conflicts: Array<{ description: string; involves: string[] }>;
}): ParsedContext {
  const categories = ['academic', 'fellowship', 'business', 'work', 'personal', 'other'] as const;
  return {
    responsibilities: row.responsibilities.map((r) => ({
      title: r.title,
      category: (categories as readonly string[]).includes(r.category)
        ? (r.category as (typeof categories)[number])
        : 'other',
      timeRef: r.timeRef,
      fixedTime: r.fixedTime,
      flexible: r.flexible,
      delegatable: r.delegatable,
      detail: r.detail,
    })),
    conflicts: row.conflicts.map((c) => ({ description: c.description, involves: c.involves })),
    uncertainties: row.uncertainties,
  };
}

@Injectable()
export class SituationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  private async owned(id: string, userId: string) {
    const situation = await this.prisma.situation.findFirst({
      where: { id, userId },
      include: situationInclude,
    });
    if (!situation) throw notFound('Situation not found');
    return situation;
  }

  listMine(userId: string) {
    return this.prisma.situation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, text: true, confirmed: true, createdAt: true, updatedAt: true },
    });
  }

  async create(userId: string, dto: CreateSituationDto) {
    const { context } = await this.ai.understand(dto.text.trim());
    return this.prisma.situation.create({
      data: {
        userId,
        text: dto.text.trim(),
        context: {
          create: {
            uncertainties: context.uncertainties,
            responsibilities: { create: context.responsibilities },
            conflicts: { create: context.conflicts.map((c) => ({ description: c.description, involves: c.involves })) },
          },
        },
      },
      include: situationInclude,
    });
  }

  get(userId: string, id: string) {
    return this.owned(id, userId);
  }

  async update(userId: string, id: string, dto: UpdateSituationDto) {
    const situation = await this.owned(id, userId);
    if (dto.text?.trim()) {
      const { context } = await this.ai.understand(dto.text.trim(), id);
      await this.prisma.situationContext.deleteMany({ where: { situationId: id } });
      await this.prisma.situation.update({
        where: { id },
        data: {
          text: dto.text.trim(),
          confirmed: false,
          context: {
            create: {
              uncertainties: context.uncertainties,
              responsibilities: { create: context.responsibilities },
              conflicts: { create: context.conflicts.map((c) => ({ description: c.description, involves: c.involves })) },
            },
          },
        },
      });
    }
    if (typeof dto.confirmed === 'boolean') {
      await this.prisma.situation.update({ where: { id }, data: { confirmed: dto.confirmed } });
    }
    return this.owned(id, userId);
  }

  async prioritize(userId: string, id: string) {
    const situation = await this.owned(id, userId);
    if (!situation.context) throw apiError('VALIDATION_ERROR', 'Analyze the situation first', HttpStatus.BAD_REQUEST);
    if (!situation.confirmed) {
      throw apiError('CONFIRM_FIRST', 'Confirm your understanding before requesting a recommendation', HttpStatus.BAD_REQUEST);
    }
    const parsed = toParsedContext(situation.context);
    const { recommendation } = await this.ai.prioritize({
      situationText: situation.text,
      context: parsed,
      situationId: id,
    });
    const version = situation.recommendations.length + 1;
    const created = await this.prisma.recommendation.create({
      data: {
        situationId: id,
        version,
        recommendedPriority: recommendation.recommendedPriority,
        why: recommendation.why,
        nextAction: recommendation.nextAction,
        others: recommendation.others as unknown as Prisma.InputJsonArray,
        reassessIf: recommendation.reassessIf,
        uncertaintyNotes: recommendation.uncertaintyNotes,
      },
    });
    return { recommendation: created, situation: await this.owned(id, userId) };
  }

  recommendations(userId: string, id: string) {
    return this.owned(id, userId).then((s) => s.recommendations);
  }

  async reassess(userId: string, id: string, dto: ReassessDto) {
    const situation = await this.owned(id, userId);
    if (!situation.context) throw apiError('VALIDATION_ERROR', 'Analyze the situation first', HttpStatus.BAD_REQUEST);
    const parsed = toParsedContext(situation.context);
    // Merge newly mentioned responsibilities without dropping history.
    const { context: extra } = await this.ai.understand(dto.update_text.trim(), id);
    const titles = new Set(parsed.responsibilities.map((r) => r.title));
    for (const r of extra.responsibilities) {
      if (!titles.has(r.title)) parsed.responsibilities.push(r);
    }
    const { recommendation } = await this.ai.prioritize({
      situationText: situation.text,
      context: parsed,
      newInfo: dto.update_text.trim(),
      situationId: id,
    });
    const version = situation.recommendations.length + 1;
    const [created] = await this.prisma.$transaction([
      this.prisma.recommendation.create({
        data: {
          situationId: id,
          version,
          recommendedPriority: recommendation.recommendedPriority,
          why: recommendation.why,
          nextAction: recommendation.nextAction,
          others: recommendation.others as unknown as Prisma.InputJsonArray,
          reassessIf: recommendation.reassessIf,
          uncertaintyNotes: recommendation.uncertaintyNotes,
        },
      }),
      this.prisma.reassessment.create({ data: { situationId: id, updateText: dto.update_text.trim() } }),
    ]);
    return { recommendation: created, situation: await this.owned(id, userId) };
  }

  async feedback(userId: string, id: string, dto: FeedbackDto) {
    await this.owned(id, userId);
    return this.prisma.feedback.upsert({
      where: { situationId: id },
      create: { situationId: id, helpful: dto.helpful, note: dto.note ?? '' },
      update: { helpful: dto.helpful, note: dto.note ?? '' },
    });
  }
}
