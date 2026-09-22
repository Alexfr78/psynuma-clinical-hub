import { describe, expect, it, vi } from 'vitest';
import { MAX_RECORDING_BYTES, MAX_RECORDING_MS, STOP_RECORDING_BYTES, OrderedPartQueue, retryDelay, selectRecorderMimeType } from '@/lib/web-recorder/parts';
import { validateWebRecordingParts, webRecordingPartName, WEB_RECORDING_MAX_BYTES, WEB_RECORDING_MAX_PARTS } from '../../../supabase/functions/_shared/webRecordingParts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('web recorder format and limits', () => {
  it('prefers Opus, then WebM, then Safari MP4', () => {
    expect(selectRecorderMimeType(() => true)).toBe('audio/webm;codecs=opus');
    expect(selectRecorderMimeType((mime) => mime === 'audio/webm' || mime === 'audio/mp4')).toBe('audio/webm');
    expect(selectRecorderMimeType((mime) => mime === 'audio/mp4')).toBe('audio/mp4');
    expect(() => selectRecorderMimeType(() => false)).toThrow(/navegador/);
  });

  it('caps recordings at two hours with room below the shared size limit', () => {
    expect(MAX_RECORDING_MS).toBe(120 * 60 * 1000);
    expect(MAX_RECORDING_BYTES).toBe(WEB_RECORDING_MAX_BYTES);
    expect(STOP_RECORDING_BYTES).toBeLessThan(MAX_RECORDING_BYTES);
    expect(retryDelay(0)).toBe(1000);
    expect(retryDelay(1)).toBe(2000);
    expect(retryDelay(20)).toBe(30000);
  });
});

describe('OrderedPartQueue', () => {
  it('uploads in numerical order and deletes only after confirmation', async () => {
    const events: string[] = [];
    const sizes: number[] = [];
    const queue = new OrderedPartQueue<string>(
      async (index, part) => { events.push(`send:${index}:${part}`); },
      async (index) => { events.push(`ack:${index}`); },
      (size) => sizes.push(size),
    );
    queue.add(2, 'c'); queue.add(0, 'a'); queue.add(1, 'b');
    await queue.flush();
    expect(events).toEqual(['send:0:a', 'ack:0', 'send:1:b', 'ack:1', 'send:2:c', 'ack:2']);
    expect(sizes).toEqual([1, 2, 3, 2, 1, 0]);
  });

  it('waits for an ACK before advancing and shares concurrent flushes', async () => {
    const gate = deferred();
    const send = vi.fn(async () => {});
    const ack = vi.fn(() => gate.promise);
    const queue = new OrderedPartQueue(send, ack);
    queue.add(0, 'a'); queue.add(1, 'b');
    const first = queue.flush();
    const second = queue.flush();
    expect(second).toBe(first);
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    expect(queue.size).toBe(2);
    gate.resolve();
    await Promise.all([first, second]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(queue.size).toBe(0);
  });

  it('retries a failed upload before sending later parts', async () => {
    const order: number[] = [];
    const sleep = vi.fn(async () => {});
    const ack = vi.fn(async () => {});
    let failures = 0;
    const queue = new OrderedPartQueue(async (index) => {
      order.push(index);
      if (index === 0 && failures++ < 2) throw new Error('offline');
    }, ack, undefined, sleep);
    queue.add(0, 'a'); queue.add(1, 'b');
    await queue.flush();
    expect(order).toEqual([0, 0, 0, 1]);
    expect(sleep.mock.calls).toEqual([[1000], [2000]]);
    expect(ack.mock.calls).toEqual([[0], [1]]);
  });

  it('keeps all pending parts after retry exhaustion and supports a later flush', async () => {
    const send = vi.fn(async (): Promise<void> => { throw new Error('offline'); });
    const ack = vi.fn(async () => {});
    const sleep = vi.fn(async () => {});
    const queue = new OrderedPartQueue(send, ack, undefined, sleep);
    queue.add(0, 'a'); queue.add(1, 'b');
    await expect(queue.flush()).rejects.toThrow('offline');
    expect(send).toHaveBeenCalledTimes(5);
    expect(sleep.mock.calls).toEqual([[1000], [2000], [4000], [8000]]);
    expect(ack).not.toHaveBeenCalled();
    expect(queue.size).toBe(2);
    send.mockImplementation(async () => {});
    await queue.flush();
    expect(queue.size).toBe(0);
  });

  it('retains an uploaded part when local acknowledgement fails', async () => {
    const send = vi.fn(async () => {});
    const ack = vi.fn(async (): Promise<void> => { throw new Error('IndexedDB'); });
    const queue = new OrderedPartQueue(send, ack, undefined, async () => {});
    queue.add(0, 'a');
    await expect(queue.flush()).rejects.toThrow('IndexedDB');
    expect(queue.size).toBe(1);
    ack.mockImplementation(async () => {});
    await queue.flush();
    expect(queue.size).toBe(0);
  });

  it('stops after an in-flight upload without acknowledging or sending another part', async () => {
    const gate = deferred();
    const send = vi.fn(() => gate.promise);
    const ack = vi.fn(async () => {});
    const queue = new OrderedPartQueue(send, ack);
    queue.add(0, 'a'); queue.add(1, 'b');
    const running = queue.flush();
    queue.stop();
    gate.resolve();
    await running;
    await queue.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(ack).not.toHaveBeenCalled();
    expect(queue.size).toBe(2);
  });

  it('rejects duplicate and invalid indexes', () => {
    const queue = new OrderedPartQueue(async () => {}, async () => {});
    queue.add(0, 'a');
    for (const index of [0, -1, 0.5, NaN, Infinity]) {
      expect(() => queue.add(index, 'b')).toThrow();
    }
    expect(queue.size).toBe(1);
  });
});

describe('web recording server part validation', () => {
  it('sorts a contiguous complete list without modifying it', () => {
    const names = ['000002', '000000', '000001'];
    expect(validateWebRecordingParts(names, 3)).toEqual(['000000', '000001', '000002']);
    expect(names).toEqual(['000002', '000000', '000001']);
    expect(webRecordingPartName(12)).toBe('000012');
  });

  it.each([
    [['000000'], 2], [[], 0], [['000000'], 1.5],
    [['000001'], 1], [['000000', '000002'], 2],
    [['000000', '000000'], 2], [['0'], 1], [['000000.webm'], 1],
  ])('rejects missing, repeated or malformed parts: %j, count %s', (names, count) => {
    expect(() => validateWebRecordingParts(names as string[], count as number)).toThrow();
  });

  it('rejects invalid part indexes and excessive declared counts', () => {
    for (const index of [-1, 1.5, NaN, WEB_RECORDING_MAX_PARTS]) {
      expect(() => webRecordingPartName(index)).toThrow();
    }
    expect(() => validateWebRecordingParts([], WEB_RECORDING_MAX_PARTS + 1)).toThrow();
  });
});
