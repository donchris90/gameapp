import { HttpException } from '@nestjs/common';

/** Error with a stable machine-readable `error` code the mobile app can switch on. */
export function appError(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return new HttpException({ statusCode: status, error: code, message, ...extra }, status);
}
