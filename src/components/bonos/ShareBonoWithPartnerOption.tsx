import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface ShareBonoWithPartnerOptionProps {
  partnerName: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ShareBonoWithPartnerOption({
  partnerName,
  checked,
  onCheckedChange,
  disabled,
}: ShareBonoWithPartnerOptionProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <Checkbox
        id="share-bono-with-partner"
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        disabled={disabled}
      />
      <div className="space-y-1">
        <Label htmlFor="share-bono-with-partner" className="cursor-pointer">
          Compartir el bono con {partnerName}
        </Label>
        <p className="text-xs text-muted-foreground">
          Cada sesión de cualquiera de los dos, individual o de pareja, descontará una sesión del bono.
        </p>
      </div>
    </div>
  );
}
