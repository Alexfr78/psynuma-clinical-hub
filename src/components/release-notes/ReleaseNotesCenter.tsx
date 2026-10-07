import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useReleaseNotes } from '@/hooks/useReleaseNotes';
import { isPwaReloadBlocked } from '@/lib/pwa-update-guard';
import type { ReleaseNoteVersion } from '@/lib/release-notes';
import { ReleaseNotesList } from './ReleaseNotesList';

// Se espera a que la pantalla haya cargado antes de avisar.
const ANNOUNCE_DELAY_MS = 4000;
// Durante una grabación no se interrumpe: se vuelve a mirar cada medio minuto.
const RECORDING_RETRY_MS = 30000;

// Una vez por sesión del navegador: "Ver más tarde" o ignorar el aviso no lo repite hasta
// la próxima vez que se abra Psycma. Lo visto de verdad se guarda en el perfil.
function alreadyAnnounced(key: string): boolean {
  try { return sessionStorage.getItem(key) === '1'; } catch { return false; }
}
function rememberAnnounced(key: string) {
  try { sessionStorage.setItem(key, '1'); } catch { /* sin almacenamiento: puede repetirse */ }
}

/**
 * Botón de Novedades de la cabecera y avisos de versión nueva.
 * - Versión destacada sin ver: ventana con todo lo pendiente.
 * - Versión normal sin ver: aviso breve con "Ver" y un punto en el botón.
 */
export function ReleaseNotesCenter() {
  const { versions, unseen, announcement, markSeen } = useReleaseNotes();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Se fija al abrir: al marcar como visto el anuncio desaparece y la ventana se vaciaría al cerrarse.
  const [dialogVersions, setDialogVersions] = useState<ReleaseNoteVersion[]>([]);
  const [dialogUntil, setDialogUntil] = useState<string | null>(null);
  // Lo que había sin ver al abrir: mantiene la etiqueta "Nuevo" aunque ya se haya marcado.
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const timer = useRef<number | undefined>(undefined);

  const unseenIds = useMemo(() => new Set(unseen.map((v) => v.id)), [unseen]);
  const latestUnseen = unseen[0]?.published_at;

  const openSheet = () => {
    setHighlightIds(new Set(unseenIds));
    setSheetOpen(true);
    if (latestUnseen) markSeen(latestUnseen);
  };

  useEffect(() => {
    if (announcement.kind === 'none') return;
    const key = `psycma-release-notes:${announcement.until}`;
    if (alreadyAnnounced(key)) return;

    const show = () => {
      if (isPwaReloadBlocked()) {
        timer.current = window.setTimeout(show, RECORDING_RETRY_MS);
        return;
      }
      rememberAnnounced(key);
      if (announcement.kind === 'dialog') {
        setDialogVersions(announcement.versions);
        setDialogUntil(announcement.until);
        setDialogOpen(true);
        return;
      }
      const latest = announcement.versions[0];
      const count = announcement.versions.reduce((n, v) => n + v.changes.length, 0);
      toast(`Novedades en Psycma ${latest.version_code}`, {
        description: `${count} cambio${count !== 1 ? 's' : ''} desde tu última visita`,
        duration: 12000,
        action: { label: 'Ver', onClick: () => openSheet() },
      });
    };

    timer.current = window.setTimeout(show, ANNOUNCE_DELAY_MS);
    return () => window.clearTimeout(timer.current);
    // openSheet cambia en cada render; el aviso depende solo de qué hay que anunciar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcement.kind, announcement.kind !== 'none' ? announcement.until : null]);

  const acknowledge = () => {
    if (dialogUntil) markSeen(dialogUntil);
    setDialogOpen(false);
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-8 w-8"
              onClick={openSheet}
              aria-label={unseen.length ? 'Novedades (hay cambios sin ver)' : 'Novedades'}
            >
              <Icon name="campaign" className="h-5 w-5" />
              {unseen.length > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-card" aria-hidden />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Novedades</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Novedades</SheetTitle>
            <SheetDescription>Lo que ha cambiado en Psycma en las últimas versiones.</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            {versions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Todavía no hay novedades publicadas.</p>
            ) : (
              <ReleaseNotesList versions={versions} unseenIds={highlightIds} />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) setDialogOpen(false); }}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="campaign" className="h-5 w-5 text-primary" />
              Novedades en Psycma
            </DialogTitle>
            <DialogDescription>Esto es lo que ha cambiado desde tu última visita.</DialogDescription>
          </DialogHeader>
          <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
            <ReleaseNotesList versions={dialogVersions} />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Ver más tarde</Button>
            <Button onClick={acknowledge}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
