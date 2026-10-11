import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AnalyzeContextBodyDto } from './analysis.controller';

/**
 * Guards the /api/analysis contract: the global ValidationPipe runs with
 * whitelist:true, which strips any DTO property lacking a decorator.
 * An arbitrary-but-valid context object must survive the pipe untouched.
 */
describe('AnalyzeContextBodyDto whitelist behavior', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false });

  it('keeps an opaque context payload through the global pipe', async () => {
    const payload = { context: { reference: { nowIso: 'x', timezone: 'y' }, deep: [1, 2, { three: true }] } };
    const out = (await pipe.transform(payload, { type: 'body', metatype: AnalyzeContextBodyDto })) as AnalyzeContextBodyDto;
    expect(out.context).toEqual(payload.context);
  });

  it('keeps optional overrides alongside the context', async () => {
    const payload = { context: { a: 1 }, nowIso: '2026-10-06T17:00:00.000Z', timezone: 'Africa/Lagos' };
    const out = (await pipe.transform(payload, { type: 'body', metatype: AnalyzeContextBodyDto })) as AnalyzeContextBodyDto;
    expect(out.nowIso).toBe(payload.nowIso);
    expect(out.timezone).toBe(payload.timezone);
  });
});
