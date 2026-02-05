import { z } from 'zod';
import logger from './logger';

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class ValidationError extends Error {
  constructor(message: string, public readonly errors: z.ZodError) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): ValidationResult<T> {
  try {
    const validated = schema.parse(data);
    logger.debug('Input validation successful', { context, data: validated });
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ');

      logger.error('Input validation failed', {
        context,
        errors: error.errors,
        data
      });

      return {
        success: false,
        error: `Validation failed: ${errorMessage}`
      };
    }

    logger.error('Unexpected validation error', { context, error });
    return {
      success: false,
      error: 'Unexpected validation error'
    };
  }
}

export function safeParse<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): T | null {
  const result = validateInput(schema, data, context);
  return result.success && result.data !== undefined ? result.data : null;
}

export function assertValid<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): T {
  const result = validateInput(schema, data, context);
  if (!result.success || result.data === undefined) {
    throw new Error(result.error);
  }
  return result.data;
}

export function validatePath(path: string): ValidationResult<string> {
  const pathSchema = z.string().min(1).regex(/^[a-zA-Z]:\\|[a-zA-Z]:\/|^\//, 'Invalid path format');
  return validateInput(pathSchema, path, 'path');
}

export function validateUsername(username: string): ValidationResult<string> {
  const usernameSchema = z.string()
    .min(1, 'Username is required')
    .max(50, 'Username too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username contains invalid characters');

  return validateInput(usernameSchema, username, 'username');
}

export function validateChannel(channel: string): ValidationResult<'latest' | 'beta'> {
  const channelSchema = z.enum(['latest', 'beta']);
  return validateInput(channelSchema, channel, 'channel');
}
