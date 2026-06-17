/** Format Zod validation issues for display (client zod@4 uses `.issues`, not `.errors`). */
export function formatZodIssues(
  error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> },
  separator = '\n',
): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.map(String).join('.') : 'form';
      return `${field}: ${issue.message}`;
    })
    .join(separator);
}
