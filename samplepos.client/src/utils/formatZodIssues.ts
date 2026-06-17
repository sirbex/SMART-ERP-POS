import type { ZodError } from 'zod';

/** Format Zod v4 validation issues for display (client uses zod@4 — use `.issues`, not `.errors`). */
export function formatZodIssues(error: ZodError, separator = '\n'): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join('.') : 'form';
      return `${field}: ${issue.message}`;
    })
    .join(separator);
}
