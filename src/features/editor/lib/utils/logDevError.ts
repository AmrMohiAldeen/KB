export function logDevError(message: string, error: unknown): void {
  if (process.env.NODE_ENV !== 'production') {
    console.error(message, error);
  }
}
