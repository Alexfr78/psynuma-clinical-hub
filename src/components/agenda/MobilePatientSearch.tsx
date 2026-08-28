import { useState, useEffect, useRef } from 'react';

import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePatients } from '@/hooks/usePatients';
import { Icon } from '@/components/ui/icon';

interface MobilePatientSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (patientId: string) => void;
  onCreateNew: (searchTerm: string) => void;
}

export function MobilePatientSearch({
  open,
  onOpenChange,
  onSelect,
  onCreateNew,
}: MobilePatientSearchProps) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: patients } = usePatients();

  const filtered = patients?.filter((p) =>
    `${p.first_name} ${p.last_name}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  // Auto-focus input when sheet opens
  useEffect(() => {
    if (open) {
      setSearch('');
      // Small delay to let sheet animate in
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[100dvh] flex flex-col p-0 rounded-none [&>button]:hidden"
      >
        {/* Fixed header */}
        <div className="flex items-center gap-3 px-4 pt-[env(safe-area-inset-top,0px)] border-b bg-background">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-10 w-10"
            onClick={() => onOpenChange(false)}
          >
            <Icon name="close" className="h-5 w-5" />
          </Button>
          <div className="relative flex-1 py-3">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Buscar contacto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11 text-base"
              autoComplete="off"
              autoCorrect="off"
              enterKeyHint="search"
            />
          </div>
        </div>

        {/* Scrollable results */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {filtered && filtered.length > 0 ? (
            <div className="py-2">
              {filtered.slice(0, 50).map((patient) => (
                <button
                  key={patient.id}
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-3 active:bg-accent transition-colors text-left min-h-[52px]"
                  onClick={() => {
                    onSelect(patient.id);
                    onOpenChange(false);
                  }}
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon name="person" className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {patient.first_name} {patient.last_name}
                    </p>
                    {patient.email && (
                      <p className="text-sm text-muted-foreground truncate">
                        {patient.email}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <Icon name="person" className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground mb-4">
                {search
                  ? 'No se encontraron contactos.'
                  : 'Escribe para buscar un contacto.'}
              </p>
              {search && (
                <Button
                  variant="outline"
                  onClick={() => {
                    onCreateNew(search);
                    onOpenChange(false);
                  }}
                >
                  <Icon name="add" className="h-4 w-4 mr-2" />
                  Crear nueva ficha de paciente
                </Button>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
