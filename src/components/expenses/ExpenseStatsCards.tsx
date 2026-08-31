import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useExpenseStats } from '@/hooks/useExpenses';

interface ExpenseStatsCardsProps {
  month?: string;
}

export function ExpenseStatsCards({ month }: ExpenseStatsCardsProps) {
  const { data: stats, isLoading } = useExpenseStats(month);

  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Pendiente este mes</CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
          <p className="text-lg sm:text-2xl font-bold text-amber-600 tabular-nums">
            {isLoading ? '—' : `${stats?.totalPending.toFixed(2)} €`}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Pagado este mes</CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
          <p className="text-lg sm:text-2xl font-bold text-green-600 tabular-nums">
            {isLoading ? '—' : `${stats?.totalPaidThisMonth.toFixed(2)} €`}
          </p>
        </CardContent>
      </Card>
      <Card className={stats?.overdueCount ? 'border-destructive/50' : ''}>
        <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1">
            {!!stats?.overdueCount && <Icon name="warning" className="h-3 w-3 sm:h-4 sm:w-4 text-destructive" />}
            Vencidos
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
          <p className="text-lg sm:text-2xl font-bold text-destructive tabular-nums">
            {isLoading ? '—' : `${stats?.overdueAmount.toFixed(2)} €`}
          </p>
          <p className="text-[10px] sm:text-xs text-muted-foreground">{stats?.overdueCount || 0} gasto(s)</p>
        </CardContent>
      </Card>
    </div>
  );
}
