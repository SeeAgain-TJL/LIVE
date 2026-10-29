import { DATA_KEY, parseUniverse } from "./local-repository.ts";
import type { UniverseData } from "../domain/types.ts";

/** No repository.load(), seeds, migrations, backup writes, or IndexedDB access. */
export function readLabArchive(storage: { getItem(key: string): string | null }): UniverseData | null {
  const raw = storage.getItem(DATA_KEY);
  return raw === null ? null : parseUniverse(raw);
}
