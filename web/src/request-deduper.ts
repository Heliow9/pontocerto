// Share in-flight reads only. Never retain business data after a response.
export function createRequestDeduper<T>() {
  const pending = new Map<string, Promise<T>>();
  return {
    clear: () => pending.clear(),
    run(key: string, work: () => Promise<T>): Promise<T> {
      const existing = pending.get(key);
      if (existing) return existing;
      const task = work().finally(() => {
        if (pending.get(key) === task) pending.delete(key);
      });
      pending.set(key, task);
      return task;
    },
  };
}
