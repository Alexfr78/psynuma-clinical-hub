/** Clinical names never enter this database. Metadata and bytes commit together. */
export interface RecordingRecord {
  id: string;
  professionalId: string;
  centerId: string;
  patientId: string;
  sessionId: string;
  mimeType: string;
  partCount: number;
  sizeBytes: number;
  elapsedMs: number;
  startedAt: number;
  finished: boolean;
  jobId?: string;
}
export interface StoredPart { recordingId: string; index: number; blob: Blob; }

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('psycma-web-recorder', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('recordings', { keyPath: 'id' });
      const parts = request.result.createObjectStore('parts', { keyPath: ['recordingId', 'index'] });
      parts.createIndex('recordingId', 'recordingId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('No se puede abrir el almacenamiento local de audio.'));
    request.onblocked = () => reject(new Error('Cierra las otras pestañas para abrir el almacenamiento de audio.'));
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(['recordings', 'parts'], mode);
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onerror = tx.onabort = () => reject(new Error('No se pudo guardar el audio localmente. No cierres esta pestaña.'));
      try { action(tx, (result) => { value = result; }); }
      catch (error) { tx.abort(); reject(error); }
    });
  } finally { db.close(); }
}

export function saveRecording(record: RecordingRecord, part?: StoredPart): Promise<void> {
  return transaction('readwrite', (tx) => {
    tx.objectStore('recordings').put(record);
    if (part) tx.objectStore('parts').put(part);
  });
}
export function readRecordings(): Promise<RecordingRecord[]> {
  return transaction('readonly', (tx, result) => {
    const req = tx.objectStore('recordings').getAll();
    req.onsuccess = () => result(req.result);
  });
}
export function readParts(recordingId: string): Promise<StoredPart[]> {
  return transaction('readonly', (tx, result) => {
    const req = tx.objectStore('parts').index('recordingId').getAll(recordingId);
    req.onsuccess = () => result((req.result as StoredPart[]).sort((a, b) => a.index - b.index));
  });
}
export function acknowledgePart(recordingId: string, index: number): Promise<void> {
  return transaction('readwrite', (tx) => { tx.objectStore('parts').delete([recordingId, index]); });
}
export function deleteRecording(recordingId: string): Promise<void> {
  return transaction('readwrite', (tx) => {
    tx.objectStore('recordings').delete(recordingId);
    const req = tx.objectStore('parts').index('recordingId').openCursor(recordingId);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
  });
}
