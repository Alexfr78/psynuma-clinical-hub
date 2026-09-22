export const MAX_RECORDING_BYTES = 24 * 1024 * 1024;
export const STOP_RECORDING_BYTES = 22 * 1024 * 1024;
export const MAX_RECORDING_MS = 120 * 60 * 1000;

export function selectRecorderMimeType(supported: (mime: string) => boolean): string {
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(supported);
  if (!mime) throw new Error('Este navegador no permite grabar en WebM ni MP4. Prueba otro navegador.');
  return mime;
}

export function retryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000);
}

/** One writer: retry the head before advancing. ACK failures also retain the part. */
export class OrderedPartQueue<T> {
  private items = new Map<number, T>();
  private running?: Promise<void>;
  private stopped = false;

  constructor(
    private send: (index: number, item: T) => Promise<void>,
    private acknowledge: (index: number) => Promise<void>,
    private changed: (pending: number) => void = () => {},
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  get size() { return this.items.size; }
  add(index: number, item: T) {
    if (!Number.isInteger(index) || index < 0 || this.items.has(index)) throw new Error('Parte duplicada o inválida');
    this.items.set(index, item);
    this.changed(this.size);
  }
  stop() { this.stopped = true; }
  flush(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.run().finally(() => { this.running = undefined; });
    return this.running;
  }
  private async run() {
    while (this.items.size && !this.stopped) {
      const index = Math.min(...this.items.keys());
      const item = this.items.get(index)!;
      for (let attempt = 0; ; attempt++) {
        if (this.stopped) return;
        try {
          await this.send(index, item);
          if (this.stopped) return;
          await this.acknowledge(index);
          this.items.delete(index);
          this.changed(this.size);
          break;
        } catch (error) {
          if (attempt >= 4 || this.stopped) throw error;
          await this.sleep(retryDelay(attempt));
        }
      }
    }
  }
}
