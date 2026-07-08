import { useEffect, useMemo, useState } from 'react';
import { addDays, endOfMonth, endOfQuarter, endOfWeek, endOfYear, format, parseISO, startOfMonth, startOfQuarter, startOfWeek, startOfYear, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { CalendarDays, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { InvoiceWithPatient } from '@/hooks/useInvoices';
import type { PaymentWithRelations } from '@/hooks/usePayments';
import { cn } from '@/lib/utils';

export type InvoiceDateRange = {
  startDate: string;
  endDate: string;
};

type GroupBy = 'day' | 'week' | 'month';

type SelectedInvoiceBucket = InvoiceDateRange & {
  label: string;
};

type InvoiceAnalyticsCardProps = {
  invoices?: InvoiceWithPatient[];
  payments?: PaymentWithRelations[];
  isLoading?: boolean;
  range: InvoiceDateRange;
  selectedBucket: SelectedInvoiceBucket | null;
  onRangeChange: (range: InvoiceDateRange) => void;
  onSelectedBucketChange: (bucket: SelectedInvoiceBucket | null) => void;
};

const chartConfig = {
  invoiced: {
    label: 'Facturado',
    color: 'hsl(var(--primary))',
  },
  collected: {
    label: 'Cobrado',
    color: 'hsl(142 71% 45%)',
  },
} satisfies ChartConfig;

const currencyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toDateInputValue(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

function clampRange(range: InvoiceDateRange): InvoiceDateRange {
  if (range.startDate <= range.endDate) return range;
  return { startDate: range.endDate, endDate: range.startDate };
}

function getDefaultGroupBy(range: InvoiceDateRange): GroupBy {
  const start = parseISO(range.startDate);
  const end = parseISO(range.endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;

  if (days <= 45) return 'day';
  if (days <= 180) return 'week';
  return 'month';
}

function getBucketStart(date: Date, groupBy: GroupBy) {
  if (groupBy === 'month') return startOfMonth(date);
  if (groupBy === 'week') return startOfWeek(date, { weekStartsOn: 1 });
  return date;
}

function getBucketEnd(date: Date, groupBy: GroupBy) {
  if (groupBy === 'month') return endOfMonth(date);
  if (groupBy === 'week') return endOfWeek(date, { weekStartsOn: 1 });
  return date;
}

function getNextBucket(date: Date, groupBy: GroupBy) {
  if (groupBy === 'month') return startOfMonth(new Date(date.getFullYear(), date.getMonth() + 1, 1));
  if (groupBy === 'week') return addDays(date, 7);
  return addDays(date, 1);
}

function getBucketLabel(date: Date, groupBy: GroupBy) {
  if (groupBy === 'month') return format(date, 'MMM yyyy', { locale: es });
  if (groupBy === 'week') return format(date, "'Sem.' d MMM", { locale: es });
  return format(date, 'd MMM', { locale: es });
}

function getPresetRange(preset: 'current-month' | 'previous-month' | 'quarter' | 'year'): InvoiceDateRange {
  const today = new Date();

  if (preset === 'previous-month') {
    const previousMonth = subMonths(today, 1);
    return {
      startDate: toDateInputValue(startOfMonth(previousMonth)),
      endDate: toDateInputValue(endOfMonth(previousMonth)),
    };
  }

  if (preset === 'quarter') {
    return {
      startDate: toDateInputValue(startOfQuarter(today)),
      endDate: toDateInputValue(endOfQuarter(today)),
    };
  }

  if (preset === 'year') {
    return {
      startDate: toDateInputValue(startOfYear(today)),
      endDate: toDateInputValue(endOfYear(today)),
    };
  }

  return {
    startDate: toDateInputValue(startOfMonth(today)),
    endDate: toDateInputValue(endOfMonth(today)),
  };
}

function isBillableInvoice(invoice: InvoiceWithPatient) {
  return invoice.status === 'issued' || invoice.status === 'paid';
}

export function InvoiceAnalyticsCard({
  invoices = [],
  payments = [],
  isLoading,
  range,
  selectedBucket,
  onRangeChange,
  onSelectedBucketChange,
}: InvoiceAnalyticsCardProps) {
  const normalizedRange = clampRange(range);
  const [groupBy, setGroupBy] = useState<GroupBy>(() => getDefaultGroupBy(normalizedRange));

  useEffect(() => {
    setGroupBy(getDefaultGroupBy(normalizedRange));
  }, [normalizedRange.endDate, normalizedRange.startDate]);

  const [chartData, totals] = useMemo(() => {
    const start = parseISO(normalizedRange.startDate);
    const end = parseISO(normalizedRange.endDate);
    const buckets = new Map<
      string,
      {
        key: string;
        label: string;
        startDate: string;
        endDate: string;
        invoiced: number;
        collected: number;
        invoiceCount: number;
      }
    >();

    for (let cursor = getBucketStart(start, groupBy); cursor <= end; cursor = getNextBucket(cursor, groupBy)) {
      const bucketStart = cursor < start ? start : cursor;
      const rawBucketEnd = getBucketEnd(cursor, groupBy);
      const bucketEnd = rawBucketEnd > end ? end : rawBucketEnd;
      const key = toDateInputValue(bucketStart);

      buckets.set(key, {
        key,
        label: getBucketLabel(bucketStart, groupBy),
        startDate: toDateInputValue(bucketStart),
        endDate: toDateInputValue(bucketEnd),
        invoiced: 0,
        collected: 0,
        invoiceCount: 0,
      });
    }

    const findBucket = (dateValue: string) => {
      const date = parseISO(dateValue);
      const bucketStart = getBucketStart(date, groupBy);
      const adjustedStart = bucketStart < start ? start : bucketStart;
      return buckets.get(toDateInputValue(adjustedStart));
    };

    invoices.filter(isBillableInvoice).forEach((invoice) => {
      const bucket = findBucket(invoice.issue_date);
      if (!bucket) return;

      // "Facturado" = importe bruto (base + IVA), sin descontar retención IRPF
      const gross = Number(invoice.total) + Number(invoice.retention_amount ?? 0);
      bucket.invoiced += gross;
      bucket.invoiceCount += 1;
    });

    payments.forEach((payment) => {
      const bucket = findBucket(payment.payment_date);
      if (!bucket) return;

      bucket.collected += Number(payment.amount);
    });

    const rows = Array.from(buckets.values());
    const totalInvoiced = rows.reduce((sum, row) => sum + row.invoiced, 0);
    const totalCollected = rows.reduce((sum, row) => sum + row.collected, 0);
    const totalInvoices = rows.reduce((sum, row) => sum + row.invoiceCount, 0);

    return [
      rows,
      {
        invoiced: totalInvoiced,
        collected: totalCollected,
        pending: Math.max(totalInvoiced - totalCollected, 0),
        invoiceCount: totalInvoices,
      },
    ];
  }, [groupBy, invoices, normalizedRange, payments]);

  const applyRange = (nextRange: InvoiceDateRange) => {
    onSelectedBucketChange(null);
    onRangeChange(clampRange(nextRange));
  };

  const handleChartClick = (event: { activePayload?: Array<{ payload?: SelectedInvoiceBucket }> }) => {
    const bucket = event.activePayload?.[0]?.payload;
    if (!bucket) return;

    onSelectedBucketChange({
      startDate: bucket.startDate,
      endDate: bucket.endDate,
      label: bucket.label,
    });
  };

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Evolución de facturación
          </CardTitle>
          <CardDescription>Consulta lo facturado y cobrado por rango de fechas</CardDescription>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => applyRange(getPresetRange('current-month'))}>
              Este mes
            </Button>
            <Button variant="outline" size="sm" onClick={() => applyRange(getPresetRange('previous-month'))}>
              Mes anterior
            </Button>
            <Button variant="outline" size="sm" onClick={() => applyRange(getPresetRange('quarter'))}>
              Trimestre
            </Button>
            <Button variant="outline" size="sm" onClick={() => applyRange(getPresetRange('year'))}>
              Año
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_150px]">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="invoice-chart-start">
                Desde
              </label>
              <Input
                id="invoice-chart-start"
                type="date"
                value={range.startDate}
                onChange={(event) => applyRange({ ...range, startDate: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="invoice-chart-end">
                Hasta
              </label>
              <Input
                id="invoice-chart-end"
                type="date"
                value={range.endDate}
                onChange={(event) => applyRange({ ...range, endDate: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="invoice-chart-group">
                Agrupación
              </label>
              <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupBy)}>
                <SelectTrigger id="invoice-chart-group">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Día</SelectItem>
                  <SelectItem value="week">Semana</SelectItem>
                  <SelectItem value="month">Mes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Facturado</p>
            <p className="font-mono text-lg font-semibold tabular-nums">{currencyFormatter.format(totals.invoiced)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Cobrado</p>
            <p className="font-mono text-lg font-semibold tabular-nums text-green-600">{currencyFormatter.format(totals.collected)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Pendiente estimado</p>
            <p className="font-mono text-lg font-semibold tabular-nums text-amber-600">{currencyFormatter.format(totals.pending)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Facturas</p>
            <p className="font-mono text-lg font-semibold tabular-nums">{totals.invoiceCount}</p>
          </div>
        </div>

        {selectedBucket && (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span>
              Listado filtrado por <strong>{selectedBucket.label}</strong>
            </span>
            <Button variant="ghost" size="sm" onClick={() => onSelectedBucketChange(null)}>
              <RotateCcw className="h-4 w-4" />
              Ver todo el rango
            </Button>
          </div>
        )}

        {isLoading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : chartData.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            No hay datos de facturación en este rango
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <ComposedChart data={chartData} onClick={handleChartClick} margin={{ left: 8, right: 8, top: 12, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={18}
              />
              <YAxis
                width={48}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${Number(value).toLocaleString('es-ES')}€`}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <div className="flex min-w-[9rem] items-center justify-between gap-4">
                        <span className="text-muted-foreground">{name === 'invoiced' ? 'Facturado' : 'Cobrado'}</span>
                        <span className={cn('font-mono font-medium tabular-nums', name === 'collected' && 'text-green-600')}>
                          {currencyFormatter.format(Number(value))}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Bar dataKey="invoiced" fill="var(--color-invoiced)" radius={[4, 4, 0, 0]} />
              <Line
                type="monotone"
                dataKey="collected"
                stroke="var(--color-collected)"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
