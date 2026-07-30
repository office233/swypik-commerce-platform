/** Helpers for typed error handling in catch blocks (no `any`). */

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function errorStack(err: unknown): string | undefined {
  return err instanceof Error ? err.stack : undefined;
}
