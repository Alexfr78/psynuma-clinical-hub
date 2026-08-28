import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LineChart as LineIcon, BarChart3, PieChart as PieIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { AutoregistroEntry } from '@/hooks/useAutoregistroEntries';
import type { FieldDisplayMeta } from '@/lib/autoregistro-field-display';
import { getScaleMax } from '@/lib/autoregistro-fields';
import { Icon } from '@/components/ui/icon';

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2, 222 47% 50%))',
  'hsl(var(--chart-3, 173 58% 39%))',
  'hsl(var(--chart-4, 43 74% 49%))',
  'hsl(var(--chart-5, 27 87% 57%))',
  'hsl(var(--chart-6, 262 52% 58%))',
];

type ChartKind = 'line' | 'bar' | 'pie';

interface ChartConfig {
  id: string;
  kind: ChartKind;
  fieldLabel: string;
}

interface ConfigurableChartsProps {
  entries: AutoregistroEntry[];
  fieldMetas: FieldDisplayMeta[];
}

/**
 * Returns the set of chart kinds compatible with a given field type.
 */
function compatibleKinds(meta: FieldDisplayMeta): ChartKind[] {
  switch (meta.displayType) {
    case 'number':
    case 'scale':
      return ['line', 'bar'];
    case 'emotion':
    case 'select':
    case 'boolean':
      return ['bar', 'pie'];
    default:
      return [];
  }
}

export function ConfigurableCharts({ entries, fieldMetas }: ConfigurableChartsProps) {
  // Only fields that can be charted in any form
  const chartableMetas = useMemo(
    () => fieldMetas.filter((m) => compatibleKinds(m).length > 0),
    [fieldMetas],
  );

  // Default: one line chart per numeric/scale field (up to 2)
  const [charts, setCharts] = useState<ChartConfig[]>(() => {
    const numericMetas = chartableMetas
      .filter((m) => m.displayType === 'number' || m.displayType === 'scale')
      .slice(0, 2);
    return numericMetas.map((m, i) => ({
      id: `chart-${i}-${m.field.label}`,
      kind: 'line' as ChartKind,
      fieldLabel: m.field.label,
    }));
  });

  const addChart = (meta: FieldDisplayMeta) => {
    const kinds = compatibleKinds(meta);
    if (kinds.length === 0) return;
    setCharts((prev) => [
      ...prev,
      {
        id: `chart-${Date.now()}-${meta.field.label}`,
        kind: kinds[0],
        fieldLabel: meta.field.label,
      },
    ]);
  };

  const removeChart = (id: string) => {
    setCharts((prev) => prev.filter((c) => c.id !== id));
  };

  const updateChartKind = (id: string, kind: ChartKind) => {
    setCharts((prev) => prev.map((c) => (c.id === id ? { ...c, kind } : c)));
  };

  if (chartableMetas.length === 0 || entries.length === 0) {
    return null;
  }

  const availableToAdd = chartableMetas.filter(
    (m) => !charts.some((c) => c.fieldLabel === m.field.label),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Gráficos</h3>
        {availableToAdd.length > 0 && (
          <Select onValueChange={(label) => {
            const meta = chartableMetas.find((m) => m.field.label === label);
            if (meta) addChart(meta);
          }}>
            <SelectTrigger className="h-8 w-auto min-w-[160px] text-xs">
              <SelectValue placeholder="+ Añadir gráfico" />
            </SelectTrigger>
            <SelectContent>
              {availableToAdd.map((meta) => (
                <SelectItem key={meta.field.label} value={meta.field.label}>
                  {meta.shortLabel}
                  <span className="text-muted-foreground ml-1.5 text-[10px]">
                    ({meta.displayType})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {charts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No hay gráficos configurados. Añade uno desde el selector.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {charts.map((config) => {
            const meta = chartableMetas.find((m) => m.field.label === config.fieldLabel);
            if (!meta) return null;
            return (
              <ChartPanel
                key={config.id}
                config={config}
                meta={meta}
                entries={entries}
                onKindChange={(kind) => updateChartKind(config.id, kind)}
                onRemove={() => removeChart(config.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ChartPanelProps {
  config: ChartConfig;
  meta: FieldDisplayMeta;
  entries: AutoregistroEntry[];
  onKindChange: (kind: ChartKind) => void;
  onRemove: () => void;
}

function ChartPanel({ config, meta, entries, onKindChange, onRemove }: ChartPanelProps) {
  const kinds = compatibleKinds(meta);
  const label = meta.field.label;

  // Temporal data (line/bar for numeric, bar chronological for categorical counts is different)
  const temporalData = useMemo(() => {
    return [...entries]
      .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
      .map((e) => ({
        date: format(new Date(e.submitted_at), 'dd/MM', { locale: es }),
        fullDate: e.submitted_at,
        value: e.values[label] !== undefined && e.values[label] !== null
          ? Number(e.values[label])
          : null,
      }))
      .filter((d) => d.value !== null);
  }, [entries, label]);

  // Frequency data (for categorical → bar/pie: count occurrences)
  const frequencyData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const v = e.values[label];
      if (v === undefined || v === null || v === '') continue;
      const key =
        meta.displayType === 'boolean'
          ? v
            ? 'Sí'
            : 'No'
          : String(v);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [entries, label, meta.displayType]);

  const hasEnoughData =
    config.kind === 'line' || config.kind === 'bar'
      ? (meta.displayType === 'scale' || meta.displayType === 'number'
          ? temporalData.length >= 2
          : frequencyData.length >= 1)
      : frequencyData.length >= 1;

  const scaleMax =
    meta.displayType === 'scale' ? getScaleMax(meta.field) : undefined;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0 flex-1">
          <CardTitle className="text-sm truncate">{meta.shortLabel}</CardTitle>
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
            {meta.field.label}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {kinds.length > 1 && (
            <div className="flex border rounded-md overflow-hidden">
              {kinds.map((k) => {
                const Icon = k === 'line' ? LineIcon : k === 'bar' ? BarChart3 : PieIcon;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => onKindChange(k)}
                    className={`p-1 transition-colors ${
                      config.kind === k
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                    title={k === 'line' ? 'Línea' : k === 'bar' ? 'Barras' : 'Circular'}
                  >
                    <Icon className="h-3 w-3" />
                  </button>
                );
              })}
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onRemove}
            title="Quitar gráfico"
          >
            <Icon name="close" className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!hasEnoughData ? (
          <div className="text-center text-xs text-muted-foreground py-8">
            Datos insuficientes para mostrar este gráfico.
          </div>
        ) : config.kind === 'line' &&
          (meta.displayType === 'scale' || meta.displayType === 'number') ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={temporalData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" className="text-[10px]" />
              <YAxis
                className="text-[10px]"
                domain={scaleMax ? [0, scaleMax] : ['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{ fontSize: '11px' }}
                labelFormatter={(_, payload) => {
                  const full = payload?.[0]?.payload?.fullDate;
                  return full
                    ? format(parseISO(full), "d MMM yyyy 'a las' HH:mm", { locale: es })
                    : '';
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                name={meta.shortLabel}
                stroke={CHART_COLORS[0]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : config.kind === 'bar' &&
          (meta.displayType === 'scale' || meta.displayType === 'number') ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={temporalData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" className="text-[10px]" />
              <YAxis
                className="text-[10px]"
                domain={scaleMax ? [0, scaleMax] : ['auto', 'auto']}
              />
              <Tooltip contentStyle={{ fontSize: '11px' }} />
              <Bar dataKey="value" name={meta.shortLabel} fill={CHART_COLORS[0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : config.kind === 'bar' ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={frequencyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" className="text-[10px]" />
              <YAxis className="text-[10px]" allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: '11px' }} />
              <Bar dataKey="value" name="Frecuencia" fill={CHART_COLORS[0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : config.kind === 'pie' ? (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={frequencyData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={70}
                label={({ name, percent }) =>
                  `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {frequencyData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: '11px' }} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
            </PieChart>
          </ResponsiveContainer>
        ) : null}
      </CardContent>
    </Card>
  );
}
