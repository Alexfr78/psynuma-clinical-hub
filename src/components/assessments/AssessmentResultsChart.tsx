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
  fullMark?: number;
}

export function AssessmentResultsChart({ factorScores, scoring, fullMark = 7 }: AssessmentResultsChartProps) {
  // Filter out global indices for main chart (PST can be very high numbers)
  const chartFactors = Object.entries(factorScores).filter(([code]) => 
    code !== 'PST' && code !== 'PSDI' && code !== 'GSI'
  );

  const data = chartFactors.map(([code, score]) => ({
    factor: code,
    label: scoring[code]?.label || code,
    score,
    fullMark,
  }));

  const getBarColor = (score: number, maxScore: number) => {
    const ratio = score / maxScore;
    if (ratio > 0.75) return 'hsl(0, 84%, 60%)'; // Red - high concern
    if (ratio > 0.5) return 'hsl(38, 92%, 50%)'; // Orange - moderate
    if (ratio > 0.35) return 'hsl(48, 96%, 53%)'; // Yellow - low-moderate
    return 'hsl(142, 76%, 36%)'; // Green - healthy
  };

  // Dynamic legend based on fullMark
  const getLegendLabels = (maxScore: number) => {
    const q1 = Math.round(maxScore * 0.35 * 10) / 10;
    const q2 = Math.round(maxScore * 0.5 * 10) / 10;
    const q3 = Math.round(maxScore * 0.75 * 10) / 10;
    
    return [
      { color: 'hsl(142, 76%, 36%)', label: `Bajo (≤${q1})` },
      { color: 'hsl(48, 96%, 53%)', label: `Moderado (${q1}-${q2})` },
      { color: 'hsl(38, 92%, 50%)', label: `Elevado (${q2}-${q3})` },
      { color: 'hsl(0, 84%, 60%)', label: `Alto (>${q3})` },
    ];
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
                domain={[0, fullMark]}
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
                domain={[0, fullMark]}
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
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.score, fullMark)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap justify-center gap-4 mt-4 text-xs">
          {getLegendLabels(fullMark).map((item, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: item.color }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );
}