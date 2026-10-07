import { useRef, type ChangeEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface AssetTileProps {
  accept: string;
  alt: string;
  busy?: boolean;
  emptyText: string;
  formatHint: string;
  privacyTooltip?: string;
  readOnly?: boolean;
  src?: string | null;
  onRemove: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function AssetTile({ accept, alt, busy = false, emptyText, formatHint, privacyTooltip, readOnly = false, src, onRemove, onUpload }: AssetTileProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex min-h-20 items-center gap-3 rounded-md border p-2.5">
      <div className="flex h-16 w-32 shrink-0 items-center justify-center overflow-hidden rounded border border-dashed bg-muted/40">
        {src ? <img src={src} alt={alt} className="h-full w-full object-contain p-1.5" /> : <span className="space-y-0.5 px-2 text-center text-xs text-muted-foreground"><span className="block">{emptyText}</span><span className="block text-[11px]">{formatHint}</span></span>}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {privacyTooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="Información sobre la privacidad de la firma" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <Icon name="info" className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{privacyTooltip}</TooltipContent>
          </Tooltip>
        )}
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy && <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />}
              {src ? 'Cambiar' : 'Subir'}
            </Button>
            {src && <Button type="button" variant="ghost" size="sm" onClick={onRemove} disabled={busy}>Quitar</Button>}
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept={accept} className="sr-only" onChange={onUpload} disabled={readOnly || busy} />
    </div>
  );
}
