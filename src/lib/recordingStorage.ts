/**
 * Durable storage for interview recording chunks.
 *
 * Chunks are streamed from MediaRecorder into IndexedDB as they arrive, so a
 * tab close, browser crash, power loss, or upload failure does NOT destroy
 * the recording. The orphan-recovery hook scans this store on app load and
 * re-attempts upload for any session that never confirmed a server-side save.
 */

const DB_NAME = "ai-recruiters-recordings";
const DB_VERSION = 1;
const STORE_CHUNKS = "chunks";
const STORE_META = "meta";

export interface RecordingMeta {
  recordingId: string;
  sessionId: number | null;
  duration: string;
  mimeType: string;
  createdAt: number;
  updatedAt: number;
  uploaded: boolean;
  sizeBytes: number;
  chunkCount: number;
}

interface ChunkRow {
  key: string;
  recordingId: string;
  index: number;
  blob: Blob;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        const chunkStore = db.createObjectStore(STORE_CHUNKS, { keyPath: "key" });
        chunkStore.createIndex("by_recording", "recordingId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "recordingId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(storeNames, mode);
        let result: T;
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error("Transaction aborted"));
        Promise.resolve(work(t))
          .then((r) => {
            result = r;
          })
          .catch((err) => {
            try {
              t.abort();
            } catch {
              // ignore
            }
            reject(err);
          });
      }),
  );
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function newRecordingId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // ignore
  }
  return `rec-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function initMeta(recordingId: string, mimeType: string): Promise<void> {
  try {
    const now = Date.now();
    const meta: RecordingMeta = {
      recordingId,
      sessionId: null,
      duration: "0:00",
      mimeType,
      createdAt: now,
      updatedAt: now,
      uploaded: false,
      sizeBytes: 0,
      chunkCount: 0,
    };
    await tx(STORE_META, "readwrite", (t) => {
      t.objectStore(STORE_META).put(meta);
    });
  } catch (err) {
    console.warn("[recordingStorage] initMeta failed:", err);
  }
}

export async function saveChunk(
  recordingId: string,
  index: number,
  blob: Blob,
): Promise<void> {
  try {
    await tx([STORE_CHUNKS, STORE_META], "readwrite", async (t) => {
      const chunkStore = t.objectStore(STORE_CHUNKS);
      const metaStore = t.objectStore(STORE_META);
      const row: ChunkRow = {
        key: `${recordingId}:${index.toString().padStart(8, "0")}`,
        recordingId,
        index,
        blob,
      };
      chunkStore.put(row);
      const meta = (await req(metaStore.get(recordingId))) as RecordingMeta | undefined;
      if (meta) {
        meta.sizeBytes += blob.size;
        meta.chunkCount += 1;
        meta.updatedAt = Date.now();
        metaStore.put(meta);
      }
    });
  } catch (err) {
    console.warn("[recordingStorage] saveChunk failed:", err);
  }
}

export async function updateMeta(
  recordingId: string,
  patch: Partial<Pick<RecordingMeta, "sessionId" | "duration" | "uploaded">>,
): Promise<void> {
  try {
    await tx(STORE_META, "readwrite", async (t) => {
      const store = t.objectStore(STORE_META);
      const existing = (await req(store.get(recordingId))) as RecordingMeta | undefined;
      if (!existing) return;
      const next: RecordingMeta = {
        ...existing,
        ...patch,
        updatedAt: Date.now(),
      };
      store.put(next);
    });
  } catch (err) {
    console.warn("[recordingStorage] updateMeta failed:", err);
  }
}

export async function getMeta(recordingId: string): Promise<RecordingMeta | null> {
  try {
    return await tx(STORE_META, "readonly", async (t) => {
      const result = await req(t.objectStore(STORE_META).get(recordingId));
      return (result as RecordingMeta) || null;
    });
  } catch {
    return null;
  }
}

export async function assembleBlob(recordingId: string): Promise<Blob | null> {
  try {
    const meta = await getMeta(recordingId);
    if (!meta) return null;
    const chunks = await tx(STORE_CHUNKS, "readonly", async (t) => {
      const store = t.objectStore(STORE_CHUNKS);
      const idx = store.index("by_recording");
      const rows: ChunkRow[] = [];
      return new Promise<ChunkRow[]>((resolve, reject) => {
        const cursorReq = idx.openCursor(IDBKeyRange.only(recordingId));
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            rows.push(cursor.value as ChunkRow);
            cursor.continue();
          } else {
            rows.sort((a, b) => a.index - b.index);
            resolve(rows);
          }
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      });
    });
    if (chunks.length === 0) return null;
    return new Blob(chunks.map((c) => c.blob), { type: meta.mimeType || "video/webm" });
  } catch (err) {
    console.warn("[recordingStorage] assembleBlob failed:", err);
    return null;
  }
}

export async function deleteRecording(recordingId: string): Promise<void> {
  try {
    await tx([STORE_CHUNKS, STORE_META], "readwrite", async (t) => {
      const metaStore = t.objectStore(STORE_META);
      metaStore.delete(recordingId);
      const chunkStore = t.objectStore(STORE_CHUNKS);
      const idx = chunkStore.index("by_recording");
      await new Promise<void>((resolve, reject) => {
        const cursorReq = idx.openCursor(IDBKeyRange.only(recordingId));
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      });
    });
  } catch (err) {
    console.warn("[recordingStorage] deleteRecording failed:", err);
  }
}

export async function listPendingRecordings(): Promise<RecordingMeta[]> {
  try {
    return await tx(STORE_META, "readonly", async (t) => {
      const rows = (await req(t.objectStore(STORE_META).getAll())) as RecordingMeta[];
      return rows.filter((r) => !r.uploaded);
    });
  } catch {
    return [];
  }
}

// Hard cap: after 14 days, forget orphans that were never linked to a session
// (likely abandoned practice runs). Anything with a sessionId stays forever
// until uploaded successfully.
const ORPHAN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export async function pruneStaleOrphans(): Promise<number> {
  try {
    const pending = await listPendingRecordings();
    const now = Date.now();
    let removed = 0;
    for (const m of pending) {
      if (m.sessionId != null) continue;
      if (now - m.createdAt > ORPHAN_TTL_MS) {
        await deleteRecording(m.recordingId);
        removed += 1;
      }
    }
    return removed;
  } catch {
    return 0;
  }
}
