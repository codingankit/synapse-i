export function errorMessage(err: unknown, fallback = "Unknown error"): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}
