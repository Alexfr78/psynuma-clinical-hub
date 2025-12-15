import { useState } from 'react';
import { Check, ChevronsUpDown, User, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { usePatients } from '@/hooks/usePatients';

interface PatientSelectorProps {
  onSelect: (patientId: string) => void;
  disabled?: boolean;
}

export function PatientSelector({ onSelect, disabled }: PatientSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const { data: patients, isLoading } = usePatients({ search: searchValue });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-auto py-3"
          disabled={disabled}
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="h-4 w-4" />
            <span>Buscar paciente...</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nombre..."
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            <CommandEmpty>
              {isLoading ? 'Buscando...' : 'No se encontraron pacientes.'}
            </CommandEmpty>
            <CommandGroup>
              {patients?.map((patient) => (
                <CommandItem
                  key={patient.id}
                  value={patient.id}
                  onSelect={() => {
                    onSelect(patient.id);
                    setOpen(false);
                    setSearchValue('');
                  }}
                  className="flex items-center gap-3 py-2"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="font-medium truncate">
                      {patient.first_name} {patient.last_name}
                    </p>
                    {patient.email && (
                      <p className="text-xs text-muted-foreground truncate">
                        {patient.email}
                      </p>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
