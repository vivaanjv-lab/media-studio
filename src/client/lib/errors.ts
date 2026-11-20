/** A server function's error as one sentence for the page. */
export function errorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "";
  try {
    const issues = JSON.parse(message) as { message?: string }[];
    if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
  } catch {
    // Not a validation error.
  }
  return message || "That didn't work. Try again.";
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
