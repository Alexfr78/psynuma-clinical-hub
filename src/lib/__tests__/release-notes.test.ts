import { describe, expect, it } from 'vitest';
import { decideAnnouncement, groupChanges, parseReleaseNotes, unseenVersions } from '@/lib/release-notes';

const change = (id: string, change_type: string) => ({ id, title: id, summary: null, change_type, module: 'agenda' });

const version = (id: string, published_at: string, announce_mode = 'normal', changes = [change(`${id}-c`, 'feature')]) => ({
  id, version_code: id, version_name: null, description: null, published_at, announce_mode, changes,
});

describe('release notes', () => {
  it('descarta versiones sin cambios visibles y normaliza el modo', () => {
    const p = parseReleaseNotes({
      seen_at: null,
      versions: [version('a', '2026-10-01T00:00:00Z', 'raro'), version('b', '2026-10-02T00:00:00Z', 'normal', [])],
    });
    expect(p.versions.map((v) => v.id)).toEqual(['a']);
    expect(p.versions[0].announce_mode).toBe('normal');
  });

  it('tolera una respuesta vacía', () => {
    expect(parseReleaseNotes(null)).toEqual({ seenAt: null, versions: [] });
  });

  it('solo cuenta lo publicado después de lo visto', () => {
    const p = parseReleaseNotes({
      seen_at: '2026-10-02T00:00:00Z',
      versions: [version('vieja', '2026-10-01T00:00:00Z'), version('igual', '2026-10-02T00:00:00Z'), version('nueva', '2026-10-03T00:00:00Z')],
    });
    expect(unseenVersions(p).map((v) => v.id)).toEqual(['nueva']);
  });

  it('sin nada pendiente no anuncia', () => {
    expect(decideAnnouncement({ seenAt: '2026-10-05T00:00:00Z', versions: [] })).toEqual({ kind: 'none' });
  });

  it('versiones normales: aviso breve hasta la más reciente', () => {
    const p = parseReleaseNotes({
      seen_at: '2026-09-01T00:00:00Z',
      versions: [version('a', '2026-10-01T00:00:00Z'), version('b', '2026-10-03T00:00:00Z')],
    });
    const a = decideAnnouncement(p);
    expect(a.kind).toBe('toast');
    if (a.kind !== 'none') {
      expect(a.until).toBe('2026-10-03T00:00:00Z');
      expect(a.versions.map((v) => v.id)).toEqual(['b', 'a']);
    }
  });

  it('una destacada pendiente abre la ventana con todas', () => {
    const p = parseReleaseNotes({
      seen_at: '2026-09-01T00:00:00Z',
      versions: [version('a', '2026-10-01T00:00:00Z', 'highlight'), version('b', '2026-10-03T00:00:00Z')],
    });
    const a = decideAnnouncement(p);
    expect(a.kind).toBe('dialog');
    if (a.kind !== 'none') expect(a.versions).toHaveLength(2);
  });

  it('agrupa por tipo y manda lo desconocido a otros', () => {
    const groups = groupChanges([change('1', 'fix'), change('2', 'feature'), change('3', 'ui'), change('4', 'technical')]);
    expect(groups.map((g) => [g.key, g.changes.map((c) => c.id)])).toEqual([
      ['new', ['2']], ['improvement', ['3']], ['fix', ['1']], ['other', ['4']],
    ]);
  });
});
