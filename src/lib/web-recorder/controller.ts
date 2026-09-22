import { supabase } from '@/integrations/supabase/client';
import { checkPatientConsent } from '@/lib/consent-verification';
import { CONSENT_PURPOSE_LABELS, consentPurposeStatusReason } from '@/lib/consent-block-messages';
import { MAX_RECORDING_BYTES, MAX_RECORDING_MS, STOP_RECORDING_BYTES, OrderedPartQueue, selectRecorderMimeType } from './parts';
import { acknowledgePart, deleteRecording, readParts, readRecordings, saveRecording, type RecordingRecord, type StoredPart } from './storage';
import { recorderRequest, uploadPart } from './api';
import { isAccountBlockedCode } from '@/lib/transcription-account-errors';

export interface RecorderState {
  phase: 'idle' | 'starting' | 'recording' | 'paused' | 'recoverable' | 'uploading' | 'transcribing' | 'completed' | 'error';
  patientName?: string;
  elapsedMs: number;
  level: number;
  pendingParts: number;
  warning?: string;
  error?: string;
  sessionId?: string;
  canDiscard?: boolean;
}
export const idleRecorderState: RecorderState = { phase: 'idle', elapsedMs: 0, level: 0, pendingParts: 0 };
export interface StartRecording { patientId: string; sessionId: string; patientName: string; }

/** Owns the stream independently of route mounts; all durable data contains IDs only. */
export class WebRecorderController {
  state: RecorderState = idleRecorderState;
  private record?: RecordingRecord;
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private audioContext?: AudioContext;
  private analyser?: AnalyserNode;
  private queue?: OrderedPartQueue<Blob>;
  private unpersisted = new Map<number, { record: RecordingRecord; part: StoredPart }>();
  private writes: Promise<void> = Promise.resolve();
  private stopped?: Promise<void>;
  private hasStarted = false;
  private warnedDuration = false;
  private finishing?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private resolvePoll?: () => void;
  private wakeLock?: WakeLockSentinel;
  private requestingWake = false;
  private releaseLock?: () => void;
  private disposed = false;
  private initializing = true;
  private reportTimer?: ReturnType<typeof setInterval>;

  constructor(
    private professionalId: string,
    private centerId: string,
    private publish: (state: RecorderState) => void,
    private invalidate: (sessionId: string, patientId: string) => void,
  ) {}

  private set(patch: Partial<RecorderState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.publish(this.state);
  }
  private assertAlive() { if (this.disposed) throw new Error('La sesión de usuario ha cambiado.'); }
  private errorMessage(error: unknown) { return error instanceof Error ? error.message : 'No se pudo completar la grabación.'; }
  private active() { return this.recorder?.state === 'recording' || this.recorder?.state === 'paused'; }

  async initialize() {
    window.addEventListener('beforeunload', this.beforeUnload);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('online', this.online);
    try {
      const records = await readRecordings();
      this.assertAlive();
      this.record = records.find((r) => r.professionalId === this.professionalId && r.centerId === this.centerId);
      if (this.record) {
        const parts = await readParts(this.record.id);
        this.set({ phase: 'recoverable', canDiscard: !this.record.jobId, elapsedMs: this.record.elapsedMs, pendingParts: parts.length,
          sessionId: this.record.sessionId, warning: 'La grabación se interrumpió. Puedes transcribir las partes guardadas; no se puede reanudar el micrófono.' });
      }
    } catch {
      this.set({ warning: 'El almacenamiento local no está disponible. La grabación no podrá iniciarse hasta que esté habilitado.' });
    } finally { this.initializing = false; }
  }

  private beforeUnload = (event: BeforeUnloadEvent) => {
    if (this.active() || this.record && this.state.phase !== 'completed') {
      event.preventDefault(); event.returnValue = '';
    }
  };
  private visibility = () => {
    if (document.visibilityState === 'visible' && this.active()) {
      this.tick();
      void this.acquireWakeLock();
    }
  };
  private online = () => { if (this.active()) this.uploadInBackground(); };

  private async lock() {
    if (this.releaseLock) return;
    if (!navigator.locks) throw new Error('Este navegador no permite proteger la grabación entre pestañas. Utiliza un navegador actualizado.');
    await new Promise<void>((resolve, reject) => {
      void navigator.locks.request('psycma-web-recorder', { ifAvailable: true }, async (lock) => {
        if (!lock) { reject(new Error('Ya hay una grabación abierta en otra pestaña. Termínala allí antes de continuar.')); return; }
        await new Promise<void>((release) => { this.releaseLock = release; resolve(); });
      }).catch(reject);
    });
    if (this.disposed) { this.releaseLock?.(); this.releaseLock = undefined; this.assertAlive(); }
  }

  async start(input: StartRecording) {
    if (this.initializing) throw new Error('Espera un momento mientras se comprueban las grabaciones pendientes.');
    if (this.record || this.state.phase === 'starting') throw new Error('Termina o descarta la grabación pendiente antes de empezar otra.');
    this.recorder = undefined;
    this.stopped = undefined;
    this.hasStarted = false;
    this.warnedDuration = false;
    this.queue = undefined;
    this.set({ ...idleRecorderState, phase: 'starting', warning: undefined, error: undefined, canDiscard: false });
    try {
      await this.lock();
      // Re-read under the cross-tab lock: another tab may have recorded since mount.
      const pending = (await readRecordings()).find((r) => r.professionalId === this.professionalId && r.centerId === this.centerId);
      if (pending) {
        this.record = pending;
        throw new Error('Hay una grabación pendiente en este dispositivo. Recupera o descarta esa grabación.');
      }
      for (const purpose of ['recording', 'ai_processing'] as const) {
        const consent = await checkPatientConsent(supabase, input.patientId, purpose);
        if (!consent.granted) throw new Error(`${CONSENT_PURPOSE_LABELS[purpose]}: ${consentPurposeStatusReason(consent)}`);
      }
      this.assertAlive();
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('El navegador no ofrece grabación de audio. Abre la app con HTTPS en un navegador compatible.');
      }
      const mimeType = selectRecorderMimeType((type) => MediaRecorder.isTypeSupported(type));
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true,
      } });
      if (this.disposed) { stream.getTracks().forEach((track) => track.stop()); this.assertAlive(); }
      this.stream = stream;
      this.recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 24000 });
      const created = await recorderRequest<{ audioIngestionId: string }>('create-audio-ingestion', {
        centerId: this.centerId, professionalId: this.professionalId, patientId: input.patientId,
        sessionId: input.sessionId, source: 'web_recorder', mimeType: this.recorder.mimeType,
        recordedAt: new Date().toISOString(),
      });
      this.assertAlive();
      this.record = { id: created.audioIngestionId, professionalId: this.professionalId, centerId: this.centerId,
        patientId: input.patientId, sessionId: input.sessionId, mimeType: this.recorder.mimeType,
        partCount: 0, sizeBytes: 0, elapsedMs: 0, startedAt: Date.now(), finished: false };
      await saveRecording(this.record);
      this.assertAlive();
      this.makeQueue();
      this.recorder.ondataavailable = ({ data }) => { if (data.size) this.capture(data); };
      this.stopped = new Promise<void>((resolve) => {
        this.recorder!.onstop = () => {
          resolve();
          if (!this.finishing && !this.disposed) {
            this.set({ warning: 'El micrófono se detuvo. Se conservarán las partes capturadas.' });
            void this.finish();
          }
        };
      });
      this.recorder.onerror = () => {
        this.set({ warning: 'El navegador interrumpió el micrófono. Se conservará el audio capturado.' });
        void this.finish();
      };
      stream.getAudioTracks().forEach((track) => track.addEventListener('ended', () => {
        if (this.active() && !this.disposed) {
          this.set({ warning: 'Se perdió el micrófono. Se guardará el audio capturado.' });
          void this.finish();
        }
      }));
      // The analyser never connects to the speakers (no feedback).
      try {
        this.audioContext = new AudioContext();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.audioContext.createMediaStreamSource(stream).connect(this.analyser);
        void this.audioContext.resume().catch(() => {});
      } catch { this.set({ warning: 'No se puede mostrar el nivel de audio en este navegador.' }); }
      this.assertAlive();
      this.recorder.start(10_000);
      this.hasStarted = true;
      this.set({ phase: 'recording', patientName: input.patientName, sessionId: input.sessionId });
      this.timer = setInterval(() => this.tick(), 250);
      void this.acquireWakeLock();
    } catch (error) {
      this.releaseMedia();
      this.releaseLock?.(); this.releaseLock = undefined;
      this.set({ phase: this.record ? 'error' : 'idle', canDiscard: !!this.record && !this.record.jobId, error: this.errorMessage(error) });
      throw error;
    }
  }

  private makeQueue() {
    const record = this.record!;
    this.queue = new OrderedPartQueue(
      async (index, blob) => { this.assertAlive(); await uploadPart(record, index, blob); },
      (index) => acknowledgePart(record.id, index),
      (pending) => this.set({ pendingParts: pending + this.unpersisted.size }),
    );
  }

  private capture(blob: Blob) {
    if (!this.record) return;
    const index = this.record.partCount++;
    this.record.sizeBytes += blob.size;
    this.record.elapsedMs = Math.min(Date.now() - this.record.startedAt, MAX_RECORDING_MS);
    this.unpersisted.set(index, { record: { ...this.record }, part: { recordingId: this.record.id, index, blob } });
    this.set({ pendingParts: this.unpersisted.size + (this.queue?.size ?? 0) });
    this.writes = this.writes.then(() => this.persistPending()).catch(() => {
      this.set({ warning: 'No se pudo guardar una parte localmente. No cierres esta pestaña; se detendrá la grabación para reintentar.' });
      if (!this.disposed) void this.finish();
    });
    if (this.record.sizeBytes >= STOP_RECORDING_BYTES && !this.finishing) {
      this.set({ warning: 'Se ha alcanzado el límite de tamaño seguro. Se detendrá y transcribirá la grabación.' });
      void this.finish();
    }
  }

  private async persistPending() {
    for (const [index, entry] of this.unpersisted) {
      await saveRecording(entry.record, entry.part);
      this.unpersisted.delete(index);
      if (!this.disposed) this.queue!.add(index, entry.part.blob);
    }
    if (!this.disposed) this.uploadInBackground();
  }
  private uploadInBackground() {
    void this.queue?.flush().catch(() => {
      this.set({ warning: 'Hay partes pendientes de subir. Se conservan en este dispositivo y se reintentarán al terminar o recuperar la conexión.' });
    });
  }

  private tick() {
    if (!this.record || !this.active()) return;
    const elapsedMs = Math.min(Date.now() - this.record.startedAt, MAX_RECORDING_MS);
    let level = 0;
    if (this.analyser && this.recorder?.state === 'recording') {
      const values = new Uint8Array(this.analyser.fftSize);
      this.analyser.getByteTimeDomainData(values);
      level = Math.min(1, Math.sqrt(values.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / values.length) * 4);
    }
    this.set({ elapsedMs, level });
    if (elapsedMs >= 100 * 60 * 1000 && !this.warnedDuration) {
      this.warnedDuration = true;
      this.set({ warning: 'Han pasado 100 minutos. La grabación terminará automáticamente a los 120 minutos, incluidas las pausas. Mantén la pantalla encendida.' });
    }
    if (elapsedMs >= MAX_RECORDING_MS) {
      this.set({ warning: 'Se alcanzó el máximo de 120 minutos. Se está guardando la grabación.' });
      void this.finish();
    }
  }

  pause() { if (this.recorder?.state === 'recording') { this.recorder.pause(); this.set({ phase: 'paused', level: 0 }); } }
  resume() { if (this.recorder?.state === 'paused') { this.tick(); if (!this.finishing) { this.recorder.resume(); this.set({ phase: 'recording' }); } } }

  private async acquireWakeLock() {
    if (this.requestingWake || this.wakeLock && !this.wakeLock.released) return;
    if (!('wakeLock' in navigator)) { this.set({ warning: 'Mantén la pantalla encendida: este navegador no permite impedir el bloqueo.' }); return; }
    this.requestingWake = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (this.disposed || !this.active()) { await lock.release(); return; }
      this.wakeLock = lock;
      lock.addEventListener('release', () => {
        if (this.active()) this.set({ warning: 'Mantén la pantalla encendida. El sistema ha liberado el bloqueo de pantalla.' });
      });
    } catch { this.set({ warning: 'Mantén la pantalla encendida; no se pudo impedir el bloqueo.' }); }
    finally { this.requestingWake = false; }
  }

  finish(): Promise<void> {
    if (this.finishing) return this.finishing;
    // Start in a microtask so synchronous stop/error events see the in-flight guard.
    this.finishing = Promise.resolve().then(() => this.finishInternal()).catch((error) => {
      this.set({ phase: 'error', canDiscard: !!this.record && !this.record.jobId, error: this.errorMessage(error) });
    }).finally(() => { this.finishing = undefined; });
    return this.finishing;
  }
  private async finishInternal() {
    if (!this.record) return;
    await this.lock();
    if (!this.hasStarted && !this.unpersisted.size) {
      const fresh = (await readRecordings()).find((r) => r.id === this.record!.id
        && r.professionalId === this.professionalId && r.centerId === this.centerId);
      this.assertAlive();
      if (!fresh) {
        this.record = undefined;
        this.releaseLock?.(); this.releaseLock = undefined;
        this.set({ phase: 'completed', warning: 'La grabación pendiente ya se resolvió en otra pestaña.' });
        return;
      }
      this.record = fresh;
      this.queue?.stop();
      this.queue = undefined;
    }
    this.set({ phase: 'uploading', error: undefined, level: 0 });
    if (this.active()) this.recorder!.stop();
    if (this.hasStarted && this.stopped) await this.stopped;
    this.releaseMedia();
    await this.writes;
    this.assertAlive();
    if (!this.queue) {
      this.makeQueue();
      for (const part of await readParts(this.record.id)) this.queue!.add(part.index, part.blob);
    }
    await this.persistPending();
    await this.queue!.flush();
    this.assertAlive();
    this.record.finished = true;
    await saveRecording(this.record);
    if (this.record.sizeBytes >= MAX_RECORDING_BYTES) throw new Error('La grabación supera 24 MB y no se puede transcribir con seguridad. Descártala y utiliza una grabación más corta.');
    if (!this.record.partCount) throw new Error('La grabación no contiene audio. Puedes descartarla e iniciar otra.');
    if (!this.record.jobId) {
      const result = await recorderRequest<{ transcriptionJobId: string }>('finalize-web-recording', {
        audioIngestionId: this.record.id, partCount: this.record.partCount, durationMs: this.record.elapsedMs,
      });
      if (!result.transcriptionJobId) throw new Error('No se pudo preparar la transcripción. Reintenta la finalización.');
      this.record.jobId = result.transcriptionJobId;
      await saveRecording(this.record);
    }
    this.assertAlive();
    this.set({ phase: 'transcribing', canDiscard: false, warning: undefined });
    // A timeout does not cancel the server job. Cron also recovers queued jobs.
    void recorderRequest('process-transcription-job', { transcriptionJobId: this.record.jobId }).catch(() => {});
    await this.poll();
  }

  async recover() { await this.finish(); }

  private async poll() {
    const deadline = Date.now() + 30 * 60 * 1000;
    while (!this.disposed && this.record && Date.now() < deadline) {
      const { data, error } = await supabase.from('audio_ingestions').select('status').eq('id', this.record.id).maybeSingle();
      this.assertAlive();
      if (!error && data?.status === 'failed') throw new Error('La transcripción ha fallado. El audio sigue sujeto a la retención del servidor; revisa la configuración de IA.');
      if (!error && (data?.status === 'transcription_verified' || data?.status === 'audio_deleted')) {
        const { data: transcript, error: transcriptError } = await supabase.from('transcripts').select('id').eq('audio_ingestion_id', this.record.id).limit(1).maybeSingle();
        this.assertAlive();
        if (!transcriptError && transcript) {
          const { sessionId, patientId } = this.record;
          this.invalidate(sessionId, patientId);
          await deleteRecording(this.record.id);
          this.assertAlive();
          this.record = undefined;
          this.releaseLock?.(); this.releaseLock = undefined;
          this.set({ phase: 'completed', warning: 'La transcripción está lista. Los informes se generan en segundo plano según los consentimientos y plantillas configuradas.' });
          // Reports are best-effort and complete after transcription_verified.
          // Refresh active document queries for a bounded period, also when minimized.
          const until = Date.now() + 3 * 60 * 1000;
          clearInterval(this.reportTimer);
          this.reportTimer = setInterval(() => {
            if (Date.now() >= until) clearInterval(this.reportTimer);
            else this.invalidate(sessionId, patientId);
          }, 5000);
          return;
        }
      }
      if (!error && data?.status === 'expired_unprocessed') throw new Error('La grabación ha caducado en el servidor. Puedes descartarla.');
      if (!error && data?.status === 'queued_for_transcription') {
        // Sin saldo o con la clave mal: el audio ya está a salvo en el servidor y se
        // transcribirá solo cuando se arregle la cuenta, así que no hay nada que
        // conservar en este dispositivo. El aviso queda en el panel principal.
        const { data: job } = await supabase.from('transcription_jobs').select('error_code, error_message_sanitized')
          .eq('audio_ingestion_id', this.record.id).maybeSingle();
        this.assertAlive();
        if (isAccountBlockedCode(job?.error_code)) {
          await deleteRecording(this.record.id);
          this.assertAlive();
          this.record = undefined;
          this.releaseLock?.(); this.releaseLock = undefined;
          this.set({ phase: 'completed', warning: `${job?.error_message_sanitized ?? 'Hay un problema con la cuenta de OpenAI.'} El audio está guardado en el servidor y se transcribirá automáticamente cuando se resuelva.` });
          return;
        }
      }
      await new Promise<void>((resolve) => { this.resolvePoll = resolve; this.pollTimer = setTimeout(resolve, 5000); });
    }
    if (!this.disposed) throw new Error('La transcripción sigue en segundo plano. Pulsa reintentar para volver a consultar su estado.');
  }

  async discard() {
    if (!this.record || this.active() || this.finishing) return;
    await this.lock();
    this.queue?.stop();
    // Wait for any in-flight upload before deleting server parts.
    await this.queue?.flush().catch(() => {});
    try { await recorderRequest('finalize-web-recording', { audioIngestionId: this.record.id, discard: true }); }
    catch (error) { this.queue = undefined; throw error; }
    this.assertAlive();
    await deleteRecording(this.record.id);
    this.record = undefined;
    this.unpersisted.clear();
    this.releaseLock?.(); this.releaseLock = undefined;
    this.set({ ...idleRecorderState, patientName: undefined, sessionId: undefined, error: undefined, warning: undefined });
    await this.initializeRecovery();
  }
  private async initializeRecovery() {
    const next = (await readRecordings()).find((r) => r.professionalId === this.professionalId && r.centerId === this.centerId);
    if (next) {
      this.record = next;
      this.queue = undefined;
      this.set({ phase: 'recoverable', canDiscard: !next.jobId, sessionId: next.sessionId, elapsedMs: next.elapsedMs, pendingParts: (await readParts(next.id)).length });
    }
  }
  dismiss() {
    if (this.state.phase === 'completed') this.set({ ...idleRecorderState, patientName: undefined, warning: undefined, error: undefined });
    else if (this.state.phase === 'error' && this.record?.jobId) {
      void deleteRecording(this.record.id).then(() => {
        this.assertAlive();
        this.record = undefined;
        this.releaseLock?.(); this.releaseLock = undefined;
        this.set({ ...idleRecorderState, patientName: undefined, warning: undefined, error: undefined });
      }).catch((error) => this.set({ error: this.errorMessage(error) }));
    }
  }

  private releaseMedia() {
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    void this.audioContext?.close().catch(() => {});
    this.audioContext = undefined;
    this.analyser = undefined;
    void this.wakeLock?.release().catch(() => {});
    this.wakeLock = undefined;
  }
  dispose() {
    this.disposed = true;
    this.queue?.stop();
    if (this.active()) this.recorder!.stop(); // ondataavailable still durably saves the final chunk.
    this.releaseMedia();
    clearTimeout(this.pollTimer);
    this.resolvePoll?.();
    clearInterval(this.reportTimer);
    window.removeEventListener('beforeunload', this.beforeUnload);
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('online', this.online);
    // Keep cross-tab lock until final dataavailable/IndexedDB transaction has completed.
    void Promise.resolve(this.hasStarted ? this.stopped : undefined).then(() => this.writes).finally(() => { this.releaseLock?.(); this.releaseLock = undefined; });
  }
}
