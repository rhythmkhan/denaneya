export interface PollOptions {
  timeoutMs?: number;
  intervalMs?: number;
  backoffFactor?: number;
  maxAttempts?: number;
  description?: string;
}

export async function pollUntil<T>(
  predicate: () => Promise<T | null | undefined | false>,
  options: PollOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 10000;
  let currentIntervalMs = options.intervalMs ?? 100;
  const backoffFactor = options.backoffFactor ?? 1.5;
  const maxAttempts = options.maxAttempts ?? 50;
  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < timeoutMs && attempts < maxAttempts) {
    attempts++;
    try {
      const result = await predicate();
      if (result !== null && result !== undefined && result !== false) {
        return result as T;
      }
    } catch {
      // transient error, keep waiting
    }

    await new Promise((resolve) => setTimeout(resolve, currentIntervalMs));
    currentIntervalMs = Math.min(currentIntervalMs * backoffFactor, 2000);
  }

  const elapsed = Date.now() - startTime;
  const desc = options.description ?  waiting for:  : '';
  throw new Error(Polling timed out after ms ( attempts));
}
