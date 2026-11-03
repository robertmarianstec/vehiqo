// Every operation uses the same connection, including reads during transactions.
let pending: Promise<unknown> = Promise.resolve();

export function queueOperation<T>(operation: () => Promise<T>): Promise<T> {
  const next = pending.then(operation);
  pending = next.catch(() => undefined);
  return next;
}
