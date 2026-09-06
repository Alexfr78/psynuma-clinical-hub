import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Icon } from '@/components/ui/icon';
import { usePlaudSessionSearch, type PlaudSessionSearchResult } from '@/hooks/usePlaudRecordings';

interface PlaudSessionPickerProps {
  onSelect: (session: PlaudSessionSearchResult) => void;
  disabled?: boolean;
}

/**
 * Buscador de sesiones del centro para "elegir otra sesión" cuando la sugerencia del
 * sistema no es la correcta (o no hay ninguna). Busca por nombre de paciente; sin texto
 * muestra las sesiones más recientes para facilitar localizar una cita cercana a la fecha
 * de la grabación.
 */
export function PlaudSessionPicker({ onSelect, disabled }: PlaudSessionPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: sessions, isFetching } = usePlaudSessionSearch(search);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="gap-2">
          <Icon name="search" className="h-4 w-4" />
          Elegir otra sesión
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0 z-[9999] pointer-events-auto" align="start" data-vaul-no-drag>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nombre del paciente..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {isFetching ? 'Buscando...' : 'No se encontraron sesiones.'}
            </CommandEmpty>
            <CommandGroup>
              {sessions?.map((session) => (
                <CommandItem
                  key={session.id}
                  value={session.id}
                  onSelect={() => {
                    onSelect(session);
                    setOpen(false);
                    setSearch('');
                  }}
                  className="flex flex-col items-start gap-0.5 py-2"
                >
                  <span className="font-medium">
                    {session.patient_first_name} {session.patient_last_name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(session.session_date), "d 'de' MMMM yyyy", { locale: es })}
                    {' · '}
                    {session.start_time.slice(0, 5)}–{session.end_time.slice(0, 5)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
