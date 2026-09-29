import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { AssessmentResultSummary } from '@/hooks/usePatientResultsByCode';

export const NO_PARTNER_RESULT = 'none';

interface PartnerResultSelectProps {
  partnerName: string;
  results: AssessmentResultSummary[];
  value: string;
  onChange: (value: string) => void;
}

/** Selector para superponer una evaluación de la pareja vinculada. */
export function PartnerResultSelect({ partnerName, results, value, onChange }: PartnerResultSelectProps) {
  return (
    <div className="space-y-1.5 sm:w-72">
      <Label className="text-xs text-muted-foreground">Superponer con la pareja</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_PARTNER_RESULT}>No superponer</SelectItem>
          {results.map(result => (
            <SelectItem key={result.assessmentId} value={result.assessmentId}>
              {partnerName}
              {result.completedAt
                ? ` · ${format(new Date(result.completedAt), 'd MMM yyyy', { locale: es })}`
                : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
