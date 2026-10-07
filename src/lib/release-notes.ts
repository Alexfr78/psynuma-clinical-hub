/**
 * Novedades de versión que ve cada usuario al publicarse una versión.
 *
 * La base (`get_release_notes`) devuelve las versiones publicadas con sus cambios
 * visibles y hasta cuándo las ha visto el usuario. Aquí se decide qué falta por ver
 * y cómo se anuncia: una versión destacada abre una ventana; una normal solo deja
 * un aviso breve y el punto en el botón de novedades.
 */

export type AnnounceMode = 'highlight' | 'normal';

export interface ReleaseNoteChange {
  id: string;
  title: string;
  summary: string | null;
  change_type: string;
  module: string;
}

export interface ReleaseNoteVersion {
  id: string;
  version_code: string;
  version_name: string | null;
  description: string | null;
  published_at: string;
  announce_mode: AnnounceMode;
  changes: ReleaseNoteChange[];
}

export interface ReleaseNotesPayload {
  seenAt: string | null;
  versions: ReleaseNoteVersion[];
}

export type Announcement =
  | { kind: 'none' }
  | { kind: 'dialog'; versions: ReleaseNoteVersion[]; until: string }
  | { kind: 'toast'; versions: ReleaseNoteVersion[]; until: string };

/** Grupos en el orden en que se muestran al usuario. */
export const RELEASE_NOTE_GROUPS: { key: string; label: string; types: string[] }[] = [
  { key: 'new', label: 'Novedades', types: ['feature'] },
  { key: 'improvement', label: 'Mejoras', types: ['improvement', 'ui', 'legal'] },
  { key: 'fix', label: 'Correcciones', types: ['fix'] },
  { key: 'other', label: 'Otros cambios', types: [] },
];

export function parseReleaseNotes(raw: unknown): ReleaseNotesPayload {
  const obj = (raw ?? {}) as { seen_at?: unknown; versions?: unknown };
  const versions = Array.isArray(obj.versions) ? (obj.versions as ReleaseNoteVersion[]) : [];
  return {
    seenAt: typeof obj.seen_at === 'string' ? obj.seen_at : null,
    versions: versions
      .filter((v) => v && typeof v.published_at === 'string' && Array.isArray(v.changes) && v.changes.length > 0)
      .map((v) => ({ ...v, announce_mode: v.announce_mode === 'highlight' ? 'highlight' : 'normal' })),
  };
}

/** Versiones publicadas después de lo último que vio el usuario, de la más nueva a la más vieja. */
export function unseenVersions(payload: ReleaseNotesPayload): ReleaseNoteVersion[] {
  const seen = payload.seenAt ? Date.parse(payload.seenAt) : Number.NEGATIVE_INFINITY;
  return payload.versions
    .filter((v) => Date.parse(v.published_at) > seen)
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
}

/** Basta una versión destacada sin ver para que salga la ventana con todas las pendientes. */
export function decideAnnouncement(payload: ReleaseNotesPayload): Announcement {
  const versions = unseenVersions(payload);
  if (versions.length === 0) return { kind: 'none' };
  const until = versions[0].published_at;
  const kind = versions.some((v) => v.announce_mode === 'highlight') ? 'dialog' : 'toast';
  return { kind, versions, until };
}

export function groupChanges(changes: ReleaseNoteChange[]) {
  const known = new Set(RELEASE_NOTE_GROUPS.flatMap((g) => g.types));
  return RELEASE_NOTE_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    changes: changes.filter((c) => (g.types.length ? g.types.includes(c.change_type) : !known.has(c.change_type))),
  })).filter((g) => g.changes.length > 0);
}
