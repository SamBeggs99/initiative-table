const DEFAULT_MS = 12_000;

/** Reject if `promise` has not settled. Used so the loading gate cannot hang forever. */
export function withTimeout<T>(
  promise: PromiseLike<T>,
  label: string,
  ms: number = DEFAULT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
