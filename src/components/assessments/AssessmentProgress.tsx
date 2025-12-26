import { Progress } from '@/components/ui/progress';

interface AssessmentProgressProps {
  answered: number;
  total: number;
}

export function AssessmentProgress({ answered, total }: AssessmentProgressProps) {
  const percentage = total > 0 ? (answered / total) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Progreso</span>
        <span className="font-medium">{answered}/{total} respondidas</span>
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  );
}
