import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { AiInvalidOutputError, AiProviderError, AiUnavailableError } from '../ai/errors';
import { AI_INVALID_OUTPUT_MESSAGE, AI_PROVIDER_REJECTED_MESSAGE, AI_UNAVAILABLE_MESSAGE } from '../ai/provider-registry';
import { DecisionParserService, type ContextExtractor } from './parser.service';
import type { TemporalReference } from './spec';

function parserWithFailingExtractor(err: Error) {
  const prisma = {
    situation: { findFirst: async () => ({ id: 'sit-1', userId: 'u-1', text: 'assignment due tomorrow' }) },
    aiRun: { create: async () => ({}) },
  };
  const extractor: ContextExtractor = {
    name: 'failing-extractor',
    async extract(_rawText: string, _ref: TemporalReference): Promise<never> {
      throw err;
    },
  };
  return { svc: new DecisionParserService(prisma as never), extractor };
}

async function parseFailure(err: Error): Promise<HttpException> {
  const { svc, extractor } = parserWithFailingExtractor(err);
  const result = await svc
    .parse({ situationId: 'sit-1', userId: 'u-1', extractor })
    .then(() => null, (e) => e as HttpException);
  if (!result) throw new Error('expected parse to fail');
  return result;
}

describe('DecisionParserService AI error mapping', () => {
  it('maps provider auth/config rejection to a safe, actionable 503', async () => {
    const err = await parseFailure(new AiProviderError('401 key rejected', { kind: 'auth' }));
    expect(err.getStatus()).toBe(503);
    expect(err.getResponse()).toEqual({
      error: { code: 'AI_UNAVAILABLE', message: AI_PROVIDER_REJECTED_MESSAGE },
    });
    expect(JSON.stringify(err.getResponse())).not.toContain('key rejected');
  });

  it('keeps transient unavailability on the existing message', async () => {
    const err = await parseFailure(new AiUnavailableError('429 rate limited'));
    expect(err.getStatus()).toBe(503);
    expect(err.getResponse()).toEqual({
      error: { code: 'AI_UNAVAILABLE', message: AI_UNAVAILABLE_MESSAGE },
    });
  });

  it('keeps malformed output on AI_INVALID_OUTPUT 502', async () => {
    const err = await parseFailure(new AiInvalidOutputError('zod details'));
    expect(err.getStatus()).toBe(502);
    expect(err.getResponse()).toEqual({
      error: { code: 'AI_INVALID_OUTPUT', message: AI_INVALID_OUTPUT_MESSAGE },
    });
  });
});
