import { HttpException, HttpStatus } from '@nestjs/common';

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFIRM_FIRST'
  | 'AI_UNAVAILABLE'
  | 'AI_INVALID_OUTPUT'
  | 'RATE_LIMITED';

export function apiError(code: ErrorCode, message: string, status: HttpStatus) {
  return new HttpException({ error: { code, message } }, status);
}

export const notFound = (message = 'Not found') =>
  apiError('NOT_FOUND', message, HttpStatus.NOT_FOUND);
