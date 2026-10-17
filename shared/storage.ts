// Saving. Every game on the arcade shares one website, so they share the device's storage too.
// Each game gets its own labelled slot so one game can never wipe out another's progress.

/** Storage for one game: keys are stored as `llama-arcade/<gameId>/<key>`. */
export function gameStorage(gameId: string) {
  const full = (key: string) => `llama-arcade/${gameId}/${key}`;
  return {
    /** The saved value, or `undefined` if there isn't one (or storage is blocked). */
    load<T = unknown>(key: string): T | undefined {
      try {
        const raw = localStorage.getItem(full(key));
        return raw === null ? undefined : (JSON.parse(raw) as T);
      } catch {
        return undefined;
      }
    },
    save(key: string, value: unknown) {
      try {
        localStorage.setItem(full(key), JSON.stringify(value));
      } catch {
        /* storage full or blocked: keep playing */
      }
    },
    remove(key: string) {
      try {
        localStorage.removeItem(full(key));
      } catch {
        /* ignore */
      }
    },
  };
}
