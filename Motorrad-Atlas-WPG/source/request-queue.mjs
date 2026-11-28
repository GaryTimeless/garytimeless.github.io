export function createRequestQueue(gapMs = 1100) {
  let tail = Promise.resolve(), nextAt = 0;
  const aborted = () => new DOMException('Anfrage abgebrochen', 'AbortError');
  return function enqueue(work, signal) {
    const result = tail.then(async () => {
      if (signal?.aborted) throw aborted();
      while (performance.now() < nextAt) {
        await new Promise((resolve, reject) => {
          const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(aborted()); };
          const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, Math.ceil(nextAt - performance.now()));
          signal?.addEventListener('abort', cancel, { once: true });
          if (signal?.aborted) cancel();
        });
      }
      if (signal?.aborted) throw aborted();
      nextAt = performance.now() + gapMs;
      return work();
    });
    tail = result.catch(() => {});
    return result;
  };
}
