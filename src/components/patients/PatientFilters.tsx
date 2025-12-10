import { Search, Filter, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProfessionals, PatientFilters as Filters } from '@/hooks/usePatients';

interface PatientFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

export function PatientFilters({ filters, onFiltersChange }: PatientFiltersProps) {
  const { data: professionals } = useProfessionals();

  const hasActiveFilters = filters.search || (filters.status && filters.status !== 'all') || (filters.professionalId && filters.professionalId !== 'all');

  const clearFilters = () => {
    onFiltersChange({ search: '', status: 'all', professionalId: 'all' });
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o email..."
          value={filters.search || ''}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          className="pl-10"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          value={filters.status || 'all'}
          onValueChange={(value) => onFiltersChange({ ...filters, status: value })}
        >
          <SelectTrigger className="w-[140px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="inactive">Inactivo</SelectItem>
            <SelectItem value="discharged">Alta</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.professionalId || 'all'}
          onValueChange={(value) => onFiltersChange({ ...filters, professionalId: value })}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Profesional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los profesionales</SelectItem>
            {professionals?.map((prof) => (
              <SelectItem key={prof.id} value={prof.id}>
                {prof.first_name} {prof.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-4 w-4" />
            Limpiar
          </Button>
        )}
      </div>
    </div>
  );
}
