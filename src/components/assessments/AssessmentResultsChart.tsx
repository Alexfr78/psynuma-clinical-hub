import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface AssessmentResultsChartProps {
  factorScores: Record<string, number>;
  scoring: Record<string, { label: string; description?: string }>;
}

export function AssessmentResultsChart({ factorScores, scoring }: AssessmentResultsChartProps) {
  const data = Object.entries(factorScores).map(([code, score]) => ({
    factor: code,
    label: scoring[code]?.label || code,
    score,
    fullMark: 7,
  }));

  const getBarColor = (score: number) => {
    if (score > 5) return 'hsl(0, 84%, 60%)'; // Red - high concern
    if (score > 4) return 'hsl(38, 92%, 50%)'; // Orange - moderate
    if (score > 3) return 'hsl(48, 96%, 53%)'; // Yellow - low-moderate
    return 'hsl(142, 76%, 36%)'; // Green - healthy
  };

  return (
    <Tabs defaultValue="radar" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="radar">Radar</TabsTrigger>
        <TabsTrigger value="bar">Barras</TabsTrigger>
      </TabsList>

      <TabsContent value="radar" className="mt-4">
        <div className="h-[300px] sm:h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis
                dataKey="factor"
                tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 7]}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              />
              <Radar
                name="Puntuación"
                dataKey="score"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.5}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </TabsContent>

      <TabsContent value="bar" className="mt-4">
        <div className="h-[300px] sm:h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                domain={[0, 7]}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              />
              <YAxis
                dataKey="label"
                type="category"
                width={150}
                tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number) => [value.toFixed(2), 'Puntuación']}
              />
              <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.score)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-4 mt-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'hsl(142, 76%, 36%)' }} />
            <span>Saludable (≤3)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'hsl(48, 96%, 53%)' }} />
            <span>Moderado (3-4)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'hsl(38, 92%, 50%)' }} />
            <span>Elevado (4-5)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'hsl(0, 84%, 60%)' }} />
            <span>Alto (&gt;5)</span>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
