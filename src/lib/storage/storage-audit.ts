/**
 * localStorage audit (Phase 2B.1). Measures localStorage size and detects any
 * image payloads ("data:image...") that should NOT be there — metadata only.
 */

export interface LocalStorageKeyInfo {
  key: string;
  bytes: number;
}

export interface LocalStorageAudit {
  available: boolean;
  totalBytes: number;
  keys: LocalStorageKeyInfo[];
  /** Keys whose value contains an embedded image payload (should be empty). */
  imagePayloads: LocalStorageKeyInfo[];
}

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function auditLocalStorage(): LocalStorageAudit {
  if (!hasWindow()) {
    return { available: false, totalBytes: 0, keys: [], imagePayloads: [] };
  }
  const keys: LocalStorageKeyInfo[] = [];
  const imagePayloads: LocalStorageKeyInfo[] = [];
  let totalBytes = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key == null) continue;
      const value = window.localStorage.getItem(key) ?? "";
      // UTF-16: ~2 bytes/char (estimate).
      const bytes = (key.length + value.length) * 2;
      totalBytes += bytes;
      keys.push({ key, bytes });
      if (value.includes("data:image")) imagePayloads.push({ key, bytes });
    }
  } catch {
    /* ignore */
  }
  keys.sort((a, b) => b.bytes - a.bytes);
  return { available: true, totalBytes, keys, imagePayloads };
}
