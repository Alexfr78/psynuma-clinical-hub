import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useExpenseCategories } from '@/hooks/useExpenseCategories';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useProfessionalsWithRoles } from '@/hooks/useProfessionals';
import type { ExpenseFilters } from '@/hooks/useExpenses';

interface ExpenseFiltersBarProps {
  filters: ExpenseFilters;
  onChange: (filters: ExpenseFilters) => void;
}

const ALL = '__all__';

export function ExpenseFiltersBar({ filters, onChange }: ExpenseFiltersBarProps) {
  const { isAdmin } = useAuth();
  const { data: categories } = useExpenseCategories();
  const { data: suppliers } = useSuppliers();
  const { data: professionals } = useProfessionalsWithRoles();

  const professionalOptions = (professionals ?? []).filter((p) => p.roles.includes('professional'));

  return (
    <div className="flex flex-wrap gap-2">
      <Input
        type="month"
        value={filters.month ?? ''}
        onChange={(e) => onChange({ ...filters, month: e.target.value || undefined })}
        className="w-[160px]"
      />

      <Select
        value={filters.categoryId ?? ALL}
        onValueChange={(v) => onChange({ ...filters, categoryId: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-[170px]"><SelectValue placeholder="Categoría" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas las categorías</SelectItem>
          {categories?.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.supplierId ?? ALL}
        onValueChange={(v) => onChange({ ...filters, supplierId: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-[160px]"><SelectValue placeholder="Proveedor" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los proveedores</SelectItem>
          {suppliers?.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isAdmin && (
        <Select
          value={filters.professionalId ?? ALL}
          onValueChange={(v) => onChange({ ...filters, professionalId: v === ALL ? undefined : v })}
        >
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Profesional" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los profesionales</SelectItem>
            {professionalOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>{[p.first_name, p.last_name].filter(Boolean).join(' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={filters.status ?? ALL}
        onValueChange={(v) => onChange({ ...filters, status: v === ALL ? undefined : (v as ExpenseFilters['status']) })}
      >
        <SelectTrigger className="w-[150px]"><SelectValue placeholder="Estado" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los estados</SelectItem>
          <SelectItem value="pending">Pendiente</SelectItem>
          <SelectItem value="paid">Pagado</SelectItem>
          <SelectItem value="cancelled">Cancelado</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
