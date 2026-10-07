import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Badge } from '@/components/ui/badge';
import { groupChanges, type ReleaseNoteVersion } from '@/lib/release-notes';

interface Props {
  versions: ReleaseNoteVersion[];
  /** Ids de versión que el usuario aún no había visto: llevan la etiqueta "Nuevo". */
  unseenIds?: Set<string>;
}

export function ReleaseNotesList({ versions, unseenIds }: Props) {
  return (
    <div className="space-y-6">
      {versions.map((v) => (
        <section key={v.id} className="space-y-3">
          <header className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">
                Versión {v.version_code}
                {v.version_name && <span className="font-normal text-muted-foreground"> · {v.version_name}</span>}
              </h3>
              {unseenIds?.has(v.id) && <Badge className="h-5 px-1.5 text-[11px]">Nuevo</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {format(new Date(v.published_at), "d 'de' MMMM 'de' yyyy", { locale: es })}
            </p>
            {v.description && <p className="pt-1 text-sm text-muted-foreground">{v.description}</p>}
          </header>

          {groupChanges(v.changes).map((g) => (
            <div key={g.key} className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label}</p>
              <ul className="space-y-1.5">
                {g.changes.map((c) => (
                  <li key={c.id} className="flex gap-2 text-sm">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    <span className="min-w-0">
                      {c.summary || c.title}
                      <span className="ml-1.5 text-xs capitalize text-muted-foreground">· {c.module}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
