import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertCircle, Info, Calendar, FileText, TrendingUp, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { AutoregistroEntry } from '@/hooks/useAutoregistroEntries';
import type { ClinicalAlert } from '@/lib/autoregistro-field-display';

interface ClinicalSummaryHeaderProps {
  patientName: string;
  templateName: string;
  entries: AutoregistroEntry[];
  alerts: ClinicalAlert[];
  dateRange?: { from: Date | null; to: Date | null };
}

const SEVERITY_CONFIG = {
  critical: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800' },
  warning: { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800' },
  info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800' },
};

export function ClinicalSummaryHeader({
  patientName,
  templateName,
  entries,
  alerts,
  dateRange,
}: ClinicalSummaryHeaderProps) {
  const stats = useMemo(() => {
    if (entries.length === 0) return null;

    const sorted = [...entries].sort(
      (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
    );
    const lastDate = new Date(sorted[0].submitted_at);
    const firstDate = new Date(sorted[sorted.length - 1].submitted_at);

    return {
      total: entries.length,
      lastDate,
      firstDate,
      daysSinceFirst: Math.ceil((Date.now() - firstDate.getTime()) / (1000 * 60 * 60 * 24)),
      daysSinceLast: Math.ceil((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)),
    };
  }, [entries]);

  const activeAlerts = alerts.filter((a) => a.severity === 'critical' || a.severity === 'warning');

  return (
    <Card className="border-l-4 border-l-primary/40">
      <CardContent className="py-4 px-4 sm:px-6">
        <div className="flex flex-col gap-3">
          {/* Top: patient + template */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-base font-semibold truncate">{patientName}</h2>
              <p className="text-sm text-muted-foreground truncate">{templateName}</p>
            </div>
          </div>

          {/* Stats row */}
          {stats && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                {stats.total} registro{stats.total !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Último: {format(stats.lastDate, "d MMM yyyy", { locale: es })}
                {stats.daysSinceLast > 0 && (
                  <span className="text-xs">
                    (hace {stats.daysSinceLast}d)
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {format(stats.firstDate, "d MMM", { locale: es })} — {format(stats.lastDate, "d MMM yyyy", { locale: es })}
              </span>
              {dateRange?.from && dateRange?.to && (
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Mostrando: {format(dateRange.from, "d MMM", { locale: es })} — {format(dateRange.to, "d MMM", { locale: es })}
                </span>
              )}
            </div>
          )}

          {/* Clinical alerts */}
          {activeAlerts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeAlerts.map((alert, i) => {
                const config = SEVERITY_CONFIG[alert.severity];
                const Icon = config.icon;
                return (
                  <div
                    key={i}
                    className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border ${config.bg}`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                    <span>{alert.message}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
