import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebRecorderController } from '@/lib/web-recorder/controller';
import type { RecordingRecord } from '@/lib/web-recorder/storage';

const mocks = vi.hoisted(() => ({
  readRecordings: vi.fn(), readParts: vi.fn(), saveRecording: vi.fn(),
  acknowledgePart: vi.fn(), deleteRecording: vi.fn(), recorderRequest: vi.fn(),
  uploadPart: vi.fn(), from: vi.fn(),
}));
vi.mock('@/lib/web-recorder/storage', () => mocks);
vi.mock('@/lib/web-recorder/api', () => mocks);
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/lib/consent-verification', () => ({ checkPatientConsent: vi.fn() }));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

const record: RecordingRecord = {
  id: 'ingestion', professionalId: 'professional', centerId: 'center',
  patientId: 'patient', sessionId: 'session', mimeType: 'audio/webm',
  partCount: 1, sizeBytes: 10, elapsedMs: 10000, startedAt: 1000, finished: false,
};

describe('web recorder lifecycle regressions', () => {
  let controller: WebRecorderController;
  let lockReleased: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    lockReleased = vi.fn<() => void>();
    vi.stubGlobal('navigator', { locks: {
      request: vi.fn(async (_name: string, _options: object, callback: (lock: object) => Promise<void>) => {
        await callback({});
        lockReleased();
      }),
    } });
    mocks.readRecordings.mockResolvedValue([{ ...record }]);
    mocks.readParts.mockResolvedValue([]);
    mocks.saveRecording.mockResolvedValue(undefined);
    mocks.recorderRequest.mockResolvedValue({ transcriptionJobId: 'job' });
    // End polling immediately without report timers or external services.
    mocks.from.mockImplementation(() => {
      const query = {
        select: () => query, eq: () => query,
        maybeSingle: async () => ({ data: { status: 'failed' }, error: null }),
      };
      return query;
    });
    controller = new WebRecorderController('professional', 'center', vi.fn(), vi.fn());
  });

  afterEach(() => {
    controller.dispose();
    vi.unstubAllGlobals();
  });

  it('re-reads recovery metadata after acquiring the lock before finalizing', async () => {
    await controller.initialize();
    mocks.readRecordings.mockResolvedValue([{ ...record, partCount: 3, sizeBytes: 30, elapsedMs: 30000 }]);
    await controller.recover();
    expect(mocks.readRecordings).toHaveBeenCalledTimes(2);
    expect(mocks.recorderRequest).toHaveBeenCalledWith('finalize-web-recording', {
      audioIngestionId: 'ingestion', partCount: 3, durationMs: 30000,
    });
    expect(mocks.saveRecording).toHaveBeenCalledWith(expect.objectContaining({ partCount: 3, sizeBytes: 30 }));
  });

  it('does not wait forever for a stop event when recording never started', async () => {
    const released = deferred();
    // Reproduce the state after listeners are installed but before start().
    const internal = controller as unknown as {
      stopped: Promise<void>; hasStarted: boolean; releaseLock: () => void;
    };
    internal.stopped = new Promise(() => {});
    internal.hasStarted = false;
    internal.releaseLock = released.resolve;
    controller.dispose();
    await released.promise;
  });

  it('releases a lock granted after the controller was disposed', async () => {
    const grant = deferred();
    const requested = deferred();
    const released = deferred();
    vi.stubGlobal('navigator', { locks: {
      request: async (_name: string, _options: object, callback: (lock: object) => Promise<void>) => {
        requested.resolve();
        await grant.promise;
        await callback({});
        released.resolve();
      },
    } });
    await controller.initialize();
    const recovering = controller.recover();
    await requested.promise;
    controller.dispose();
    grant.resolve();
    await recovering;
    await released.promise;
    expect(mocks.recorderRequest).not.toHaveBeenCalled();
  });

  it('keeps the lock until the final local write finishes during disposal', async () => {
    const stop = deferred();
    const write = deferred();
    const released = vi.fn();
    const internal = controller as unknown as {
      stopped: Promise<void>; writes: Promise<void>; hasStarted: boolean; releaseLock: () => void;
    };
    internal.stopped = stop.promise;
    internal.writes = write.promise;
    internal.hasStarted = true;
    internal.releaseLock = released;
    controller.dispose();
    stop.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(released).not.toHaveBeenCalled();
    write.resolve();
    await vi.waitFor(() => expect(released).toHaveBeenCalledTimes(1));
  });
});
