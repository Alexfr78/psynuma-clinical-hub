import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  usePatientCustomPrices,
  useDeactivateCustomPrice,
  useCustomPriceHistory,
  type CustomPrice,
  type CustomPriceWithTarget,
} from '@/hooks/useCustomPrices';
import { CustomPriceDialog } from '@/components/pricing/CustomPriceDialog';
import { PriceBadge } from '@/components/pricing/PriceBadge';
import { PatientTariffAssignment } from '@/components/patients/PatientTariffAssignment';
import { useAuth } from '@/hooks/useAuth';
import { Icon } from '@/components/ui/icon';

// ── Helper ─────────────────────────────────────────────────────────────────────

function formatDate(date: string | null | undefined) {
  if (!date) return '—';
  return format(new Date(date + 'T00:00:00'), 'dd MMM yyyy', { locale: es });
}

function getPriceStatus(price: CustomPriceWithTarget): 'active' | 'expired' | 'inactive' | 'pending' {
  if (!price.is_active) return 'inactive';
  const today = new Date().toISOString().split('T')[0];
  if (price.end_date && price.end_date < today) return 'expired';
  if (price.start_date > today) return 'pending';
  return 'active';
}

// ── Status Badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ReturnType<typeof getPriceStatus> }) {
  switch (status) {
    case 'active':
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 font-normal" variant="outline">Activa</Badge>;
    case 'expired':
      return <Badge className="bg-orange-100 text-orange-600 border-orange-200 font-normal" variant="outline">Caducada</Badge>;
    case 'inactive':
      return <Badge className="bg-gray-100 text-gray-500 border-gray-200 font-normal" variant="outline">Inactiva</Badge>;
    case 'pending':
      return <Badge className="bg-blue-100 text-blue-600 border-blue-200 font-normal" variant="outline">Pendiente</Badge>;
  }
}

// ── History Rows ───────────────────────────────────────────────────────────────

function PriceHistoryRows({ customPriceId }: { customPriceId: string }) {
  const { data: history, isLoading } = useCustomPriceHistory(customPriceId);

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={6} className="py-3 pl-8">
          <Skeleton className="h-4 w-64" />
        </TableCell>
      </TableRow>
    );
  }

  if (!history?.length) {
    return (
      <TableRow>
        <TableCell colSpan={6} className="py-2 pl-8 text-xs text-muted-foreground italic">
          Sin historial de cambios
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {history.map((h) => (
        <TableRow key={h.id} className="bg-muted/30 text-xs">
          <TableCell className="py-1.5 pl-8">
            <span className="text-muted-foreground">
              {format(new Date(h.changed_at), "dd/MM/yyyy HH:mm", { locale: es })}
            </span>
          </TableCell>
          <TableCell className="py-1.5">
            <Badge variant="outline" className="text-xs font-normal capitalize">{h.change_type}</Badge>
          </TableCell>
          <TableCell className="py-1.5">
            {h.old_price != null ? (
              <span>{Number(h.old_price).toFixed(2)} € → <strong>{Number(h.new_price).toFixed(2)} €</strong></span>
            ) : (
              <strong>{Number(h.new_price).toFixed(2)} €</strong>
            )}
          </TableCell>
          <TableCell className="py-1.5">
            {formatDate(h.new_start_date)}
            {h.new_end_date ? ` – ${formatDate(h.new_end_date)}` : ' (indefinida)'}
          </TableCell>
          <TableCell colSpan={2} />
        </TableRow>
      ))}
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface PatientCustomPricesProps {
  patientId: string;
}

export function PatientCustomPrices({ patientId }: PatientCustomPricesProps) {
  const { isAdmin, isProfessional } = useAuth();
  const canManage = isAdmin || isProfessional;

  const { data: prices, isLoading } = usePatientCustomPrices(patientId);
  const deactivate = useDeactivateCustomPrice();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPrice, setEditingPrice] = useState<CustomPrice | undefined>();
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showOnlyActive, setShowOnlyActive] = useState(true);

  const today = new Date().toISOString().split('T')[0];

  const filteredPrices = showOnlyActive
    ? (prices ?? []).filter(p => {
        const status = getPriceStatus(p);
        return status === 'active' || status === 'pending';
      })
    : (prices ?? []);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleEdit = (price: CustomPriceWithTarget) => {
    setEditingPrice(price as CustomPrice);
    setDialogOpen(true);
  };

  const handleNewPrice = () => {
    setEditingPrice(undefined);
    setDialogOpen(true);
  };

  const handleDeactivate = async () => {
    if (!deactivatingId) return;
    await deactivate.mutateAsync({ id: deactivatingId, patientId });
    setDeactivatingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Bloque de tarifa asignada */}
      <PatientTariffAssignment patientId={patientId} />

      {/* Header excepciones manuales */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Icon name="sell" className="h-4 w-4 text-emerald-600" />
            Tarifas personalizadas
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Precios especiales para este paciente sobre servicios y bonos del centro.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => setShowOnlyActive(v => !v)}
          >
            <Icon name="filter_list" className="h-3.5 w-3.5" />
            {showOnlyActive ? 'Ver todas' : 'Solo activas'}
          </Button>
          {canManage && (
            <Button size="sm" className="gap-1" onClick={handleNewPrice}>
              <Icon name="add" className="h-4 w-4" />
              Nueva tarifa
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : filteredPrices.length === 0 ? (
        <div className="border rounded-lg py-12 flex flex-col items-center gap-3 text-center bg-muted/20">
          <Icon name="sell" className="h-8 w-8 text-muted-foreground/40" />
          <div>
            <p className="font-medium text-muted-foreground">Sin tarifas personalizadas</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {showOnlyActive
                ? 'No hay tarifas activas. Pulsa "Ver todas" para ver las caducadas/inactivas.'
                : 'Este paciente no tiene ninguna tarifa personalizada configurada.'}
            </p>
          </div>
          {canManage && !showOnlyActive && (
            <Button size="sm" variant="outline" onClick={handleNewPrice} className="mt-2 gap-1">
              <Icon name="add" className="h-4 w-4" />
              Añadir primera tarifa
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-8" />
                <TableHead>Tipo</TableHead>
                <TableHead>Servicio / Bono</TableHead>
                <TableHead className="text-right">Tarifa general</TableHead>
                <TableHead className="text-right">Tarifa aplicada</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead>Estado</TableHead>
                {canManage && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPrices.map(price => {
                const status = getPriceStatus(price);
                const isExpanded = expandedIds.has(price.id);
                const isExpiredOrInactive = status === 'expired' || status === 'inactive';

                // Construir un objeto ResolvedPrice artificial para PriceBadge
                const resolvedForBadge = {
                  base_price: price.base_price ?? 0,
                  applied_price: Number(price.custom_price),
                  pricing_source: 'custom' as const,
                  custom_price_id: price.id,
                  is_temporary: !!price.end_date,
                  valid_from: price.start_date,
                  valid_to: price.end_date,
                  note: price.notes,
                };

                return (
                  <>
                    <TableRow
                      key={price.id}
                      className={cn(
                        'group',
                        isExpiredOrInactive && 'opacity-60',
                      )}
                    >
                      {/* Expand toggle */}
                      <TableCell className="w-8 p-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => toggleExpand(price.id)}
                          title="Ver historial"
                        >
                          {isExpanded ? (
                            <Icon name="expand_less" className="h-3.5 w-3.5" />
                          ) : (
                            <Icon name="history" className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </Button>
                      </TableCell>

                      {/* Tipo */}
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {price.target_type === 'session_type' ? 'Servicio' : 'Bono'}
                        </span>
                      </TableCell>

                      {/* Nombre */}
                      <TableCell>
                        <div>
                          <span className="font-medium text-sm">
                            {price.target_name ?? '—'}
                          </span>
                          {price.notes && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="ml-1.5 text-xs text-muted-foreground cursor-help underline decoration-dotted">
                                    nota
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[200px] text-xs">
                                  {price.notes}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>

                      {/* Tarifa general */}
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {price.base_price != null ? `${Number(price.base_price).toFixed(2)} €` : '—'}
                      </TableCell>

                      {/* Tarifa aplicada */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-semibold text-sm">
                            {Number(price.custom_price).toFixed(2)} €
                          </span>
                          {price.base_price != null && price.base_price > 0 && (
                            <span className="text-xs text-emerald-600">
                              {(
                                ((price.base_price - Number(price.custom_price)) / price.base_price) *
                                100
                              ).toFixed(0)}
                              % dto.
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Vigencia */}
                      <TableCell className="text-sm">
                        <div className="flex flex-col">
                          <span>
                            {formatDate(price.start_date)}
                            {price.end_date
                              ? ` – ${formatDate(price.end_date)}`
                              : ' · indefinida'}
                          </span>
                        </div>
                      </TableCell>

                      {/* Estado */}
                      <TableCell>
                        <StatusBadge status={status} />
                      </TableCell>

                      {/* Acciones */}
                      {canManage && (
                        <TableCell className="text-right">
                          {status !== 'inactive' && (
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => handleEdit(price)}
                                    >
                                      <Icon name="edit" className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Editar tarifa</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => setDeactivatingId(price.id)}
                                    >
                                      <Icon name="power_off" className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Desactivar tarifa</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>

                    {/* Historial expandible */}
                    {isExpanded && (
                      <PriceHistoryRows key={`hist-${price.id}`} customPriceId={price.id} />
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Summary info */}
      {prices && prices.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {prices.filter(p => getPriceStatus(p) === 'active').length} tarifa(s) activa(s) ·{' '}
          {prices.filter(p => getPriceStatus(p) === 'expired').length} caducada(s) ·{' '}
          {prices.filter(p => getPriceStatus(p) === 'inactive').length} inactiva(s)
        </p>
      )}

      {/* Dialog crear/editar */}
      <CustomPriceDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingPrice(undefined);
        }}
        patientId={patientId}
        existingPrice={editingPrice}
      />

      {/* Confirmación desactivar */}
      <AlertDialog open={!!deactivatingId} onOpenChange={() => setDeactivatingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar tarifa personalizada?</AlertDialogTitle>
            <AlertDialogDescription>
              La tarifa se marcará como inactiva. A partir de ahora se aplicará la tarifa general.
              El historial de cambios se conservará.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
