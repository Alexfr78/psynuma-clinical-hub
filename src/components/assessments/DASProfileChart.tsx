import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  LabelList,
} from 'recharts';

import { DAS_FACTOR_ORDER } from '@/lib/assessment-utils';

interface DASProfileChartProps {
  factorScores: Record<string, number>;
}

const SHORT_LABELS: Record<string, string> = {
  CON: 'Consenso',
  SAT: 'Satisfacción',
  EXP: 'Exp. afectiva',
  COH: 'Cohesión',
  TOTAL: 'Ajuste diádico',
};

// En gráficos estrechos "Satisfacción" no cabe en una línea entre sus vecinas
const COMPACT_LINES: Record<string, string[]> = { Satisfacción: ['Satisfac-', 'ción'] };

// Etiqueta del eje X partida por palabras para que no se pisen en pantallas estrechas
function ScaleTick({ x, y, payload, compact }: { x?: number; y?: number; payload?: { value: string }; compact?: boolean }) {
  const value = payload?.value ?? '';
  const words = (compact && COMPACT_LINES[value]) || value.split(' ');
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={compact ? 10 : 11} fill="hsl(var(--muted-foreground))">
      {words.map((word, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 12 : 13}>
          {word}
        </tspan>
      ))}
    </text>
  );
}

// Hoja de perfil del DAS: T de cada escala unida por una línea, con la franja
// media (T 40-60) marcada. Baremo general en línea continua y clínico en discontinua.
export function DASProfileChart({ factorScores }: DASProfileChartProps) {
  const data = DAS_FACTOR_ORDER.map(code => ({
    scale: SHORT_LABELS[code],
    pd: factorScores[code],
    general: factorScores[`${code}_T_GEN`],
    clinico: factorScores[`${code}_T_CLIN`],
  }));
  const [compact, setCompact] = useState(false);

  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer width="100%" height="100%" onResize={width => setCompact(width < 440)}>
        <LineChart data={data} margin={{ top: 24, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <ReferenceArea y1={40} y2={60} fill="hsl(var(--muted))" fillOpacity={0.6} />
          <ReferenceLine y={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
          <XAxis
            dataKey="scale"
            tick={<ScaleTick compact={compact} />}
            tickLine={false}
            axisLine={{ stroke: 'hsl(var(--border))' }}
            interval={0}
            height={40}
            padding={compact ? { left: 22, right: 22 } : { left: 28, right: 28 }}
          />
          <YAxis
            domain={[20, 80]}
            ticks={[20, 30, 40, 50, 60, 70, 80]}
            width={28}
            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
            formatter={(value: number, name: string) => [`T ${value}`, name]}
            labelFormatter={(label: string, payload) => {
              const pd = payload?.[0]?.payload?.pd;
              return pd !== undefined ? `${label} · PD ${pd}` : label;
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="linear"
            dataKey="general"
            name="Baremo general"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 5, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
            activeDot={{ r: 7 }}
            isAnimationActive={false}
          >
            <LabelList dataKey="general" position="top" offset={10} style={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} />
          </Line>
          <Line
            type="linear"
            dataKey="clinico"
            name="Baremo clínico"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={{ r: 5, fill: 'hsl(var(--card))', stroke: 'hsl(var(--muted-foreground))', strokeWidth: 2 }}
            activeDot={{ r: 7 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
