import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { AutoregistroEntry } from '@/hooks/useAutoregistroEntries';
import type { AutoregistroField } from '@/hooks/useAutoregistroTemplates';

interface EntryChartProps {
  entries: AutoregistroEntry[];
  fields: AutoregistroField[];
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export function EntryChart({ entries, fields }: EntryChartProps) {
  const numericFields = fields.filter((f) => (f.type === 'number' || f.type === 'scale') && f.showInChart !== false);

  const chartData = useMemo(() => {
    if (numericFields.length === 0) return [];
    return [...entries]
      .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
      .map((e) => ({
        date: format(new Date(e.submitted_at), 'dd/MM', { locale: es }),
        ...numericFields.reduce((acc, f) => {
          const v = e.values[f.label];
          if (v !== undefined && v !== null) acc[f.label] = Number(v);
          return acc;
        }, {} as Record<string, number>),
      }));
  }, [entries, numericFields]);

  if (numericFields.length === 0 || chartData.length < 2) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Evolución temporal</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip />
            {numericFields.map((f, i) => (
              <Line
                key={f.label}
                type="monotone"
                dataKey={f.label}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
