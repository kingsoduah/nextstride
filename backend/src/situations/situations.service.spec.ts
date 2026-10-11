import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { MAX_TITLE_LENGTH, SituationsService, normalizeTitle } from './situations.service';

/**
 * Sidebar rename + delete (Phase D repair).
 * - ownership is re-checked on the server for both operations
 * - rename is display-only (never rewrites `text` or its derived history)
 * - delete is transactional and scoped to the target situation only
 */

async function apiExceptionAsync(fn: () => Promise<unknown>): Promise<HttpException> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof HttpException) return err;
    throw err;
  }
  throw new Error('expected an HttpException but none was thrown');
}

function stubPrisma() {
  return {
    situation: {
      findFirst: vi.fn().mockResolvedValue({ id: 'sit-1', text: 'original text', title: null }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ id: 'sit-1' }),
      delete: vi.fn().mockResolvedValue({ id: 'sit-1' }),
      create: vi.fn().mockResolvedValue({ id: 'sit-1' }),
    },
    aiRun: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    situationContext: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn().mockImplementation(async (ops: unknown[]) => ops),
  };
}

function service(prisma: ReturnType<typeof stubPrisma>): SituationsService {
  const ai = { understand: vi.fn(), prioritize: vi.fn() };
  return new SituationsService(prisma as unknown as PrismaService, ai as never);
}

describe('normalizeTitle', () => {
  it('trims, collapses whitespace and strips control characters', () => {
    expect(normalizeTitle('  Weekly   plan \n v2\t ')).toBe('Weekly plan v2');
    // Control characters become spaces, then collapse with the rest.
    expect(normalizeTitle('a\u0000b\u001fc')).toBe('a b c');
    expect(normalizeTitle('Exam week')).toBe('Exam week');
  });

  it('returns an empty string when nothing displayable remains', () => {
    expect(normalizeTitle('   ')).toBe('');
    expect(normalizeTitle('\n\t ')).toBe('');
  });

  it('clamps to the documented maximum length', () => {
    expect(MAX_TITLE_LENGTH).toBe(80);
    expect(normalizeTitle('x'.repeat(MAX_TITLE_LENGTH + 40))).toHaveLength(MAX_TITLE_LENGTH);
  });
});

describe('SituationsService rename', () => {
  it('writes only the title column, leaving text and history untouched', async () => {
    const prisma = stubPrisma();
    const ai = { understand: vi.fn(), prioritize: vi.fn() };
    const svc = new SituationsService(prisma as unknown as PrismaService, ai as never);

    await svc.update('user-1', 'sit-1', { title: '  Exam   week  ' });

    expect(prisma.situation.update).toHaveBeenCalledTimes(1);
    const call = prisma.situation.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'sit-1' });
    expect(call.data).toEqual({ title: 'Exam week' });
    expect(call.data).not.toHaveProperty('text');
    expect(prisma.situationContext.deleteMany).not.toHaveBeenCalled();
    expect(ai.understand).not.toHaveBeenCalled();
  });

  it('still applies confirm flags alongside a rename', async () => {
    const prisma = stubPrisma();
    await service(prisma).update('user-1', 'sit-1', { title: 'Renamed', confirmed: true });

    const written = prisma.situation.update.mock.calls.map((c) => c[0].data);
    expect(written).toContainEqual({ title: 'Renamed' });
    expect(written).toContainEqual({ confirmed: true });
  });

  it('rejects a blank title with 400 and performs no writes', async () => {
    const prisma = stubPrisma();
    const err = await apiExceptionAsync(() => service(prisma).update('user-1', 'sit-1', { title: '   \n ' }));

    expect(err.getStatus()).toBe(400);
    expect(err.getResponse()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(prisma.situation.update).not.toHaveBeenCalled();
  });

  it("rejects another user's situation with 404 and performs no writes", async () => {
    const prisma = stubPrisma();
    prisma.situation.findFirst.mockResolvedValue(null);
    const err = await apiExceptionAsync(() => service(prisma).update('someone-else', 'sit-1', { title: 'Mine' }));

    expect(err.getStatus()).toBe(404);
    expect(err.getResponse()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(prisma.situation.findFirst.mock.calls[0][0].where).toEqual({ id: 'sit-1', userId: 'someone-else' });
    expect(prisma.situation.update).not.toHaveBeenCalled();
  });
});

describe('SituationsService delete', () => {
  it('deletes the owned situation and its telemetry in one scoped transaction', async () => {
    const prisma = stubPrisma();
    const out = await service(prisma).remove('user-1', 'sit-1');

    expect(out).toEqual({ id: 'sit-1', deleted: true });
    expect(prisma.situation.findFirst.mock.calls[0][0].where).toEqual({ id: 'sit-1', userId: 'user-1' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Array-form transaction: exactly the two scoped operations, nothing else.
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
    expect(prisma.aiRun.deleteMany.mock.calls[0][0]).toEqual({ where: { situationId: 'sit-1' } });
    expect(prisma.situation.delete.mock.calls[0][0]).toEqual({ where: { id: 'sit-1' } });
  });

  it("rejects another user's situation with 404 and performs no writes", async () => {
    const prisma = stubPrisma();
    prisma.situation.findFirst.mockResolvedValue(null);
    const err = await apiExceptionAsync(() => service(prisma).remove('someone-else', 'sit-1'));

    expect(err.getStatus()).toBe(404);
    expect(err.getResponse()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.situation.delete).not.toHaveBeenCalled();
    expect(prisma.aiRun.deleteMany).not.toHaveBeenCalled();
  });

  it('propagates a database failure instead of reporting a successful deletion', async () => {
    const prisma = stubPrisma();
    prisma.$transaction.mockRejectedValueOnce(new Error('write conflict'));
    await expect(service(prisma).remove('user-1', 'sit-1')).rejects.toThrow('write conflict');
  });
});
