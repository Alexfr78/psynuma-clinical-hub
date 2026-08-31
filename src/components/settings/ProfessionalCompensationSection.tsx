import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { useAuth } from '@/hooks/useAuth';
import { useProfessionalsWithRoles } from '@/hooks/useProfessionals';
import { useExpenseCategories } from '@/hooks/useExpenseCategories';
import {
  useCompensationAgreement,
  useCompensationAgreementHistory,
  useCreateCompensationAgreement,
  type CompensationType,
  type CompensationBasis,
} from '@/hooks/useProfessionalCompensationAgreements';

export function ProfessionalCompensationSection() {
  const { isAdmin, profile } = useAuth();
  const { data: professionals } = useProfessionalsWithRoles();
  const { data: categories } = useExpenseCategories();
  const createAgreement = useCreateCompensationAgreement();

  const professionalOptions = (professionals ?? []).filter((p) => p.roles.includes('professional'));
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>('');
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!isAdmin && profile?.id) {
      setSelectedProfessionalId(profile.id);
    } else if (isAdmin && !selectedProfessionalId && professionalOptions.length > 0) {
      setSelectedProfessionalId(professionalOptions[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, profile?.id, professionalOptions.length]);

  const { data: agreement } = useCompensationAgreement(selectedProfessionalId || undefined);
  const { data: history } = useCompensationAgreementHistory(showHistory ? selectedProfessionalId : undefined);

  const [compensationType, setCompensationType] = useState<CompensationType>('fixed');
  const [fixedAmount, setFixedAmount] = useState('0');
  const [percentageRate, setPercentageRate] = useState('0');
  const [compensationBasis, setCompensationBasis] = useState<CompensationBasis>('collected_payments');
  const [defaultIrpfRate, setDefaultIrpfRate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (agreement) {
      setCompensationType(agreement.compensation_type);
      setFixedAmount(String(agreement.fixed_amount));
      setPercentageRate(String(agreement.percentage_rate));
      setCompensationBasis(agreement.compensation_basis);
      setDefaultIrpfRate(agreement.default_irpf_rate != null ? String(agreement.default_irpf_rate) : '');
      setCategoryId(agreement.category_id || '');
    } else {
      // Seed the percentage from profiles.commission_rate only when creating
      // the professional's FIRST agreement (no orphan-field coupling beyond this).
      const professional = professionalOptions.find((p) => p.id === selectedProfessionalId);
      const seededRate = professional?.commission_rate;
      setCompensationType('fixed');
      setFixedAmount('0');
      setPercentageRate(seededRate != null ? String(seededRate) : '0');
      setCompensationBasis('collected_payments');
      setDefaultIrpfRate('');
      setCategoryId('');
    }
    setEffectiveFrom(new Date().toISOString().split('T')[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreement, selectedProfessionalId]);

  const handleSave = async () => {
    if (!selectedProfessionalId) return;
    await createAgreement.mutateAsync({
      professional_id: selectedProfessionalId,
      compensation_type: compensationType,
      fixed_amount: parseFloat(fixedAmount) || 0,
      percentage_rate: parseFloat(percentageRate) || 0,
      compensation_basis: compensationBasis,
      default_irpf_rate: defaultIrpfRate ? parseFloat(defaultIrpfRate) : null,
      category_id: categoryId || null,
      effective_from: effectiveFrom,
    });
  };

  const selectedProfessional = professionalOptions.find((p) => p.id === selectedProfessionalId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compensación de profesionales</CardTitle>
        <CardDescription>
          Define cómo se liquida a cada profesional: importe fijo, porcentaje sobre lo cobrado/facturado, o mixto.
          El sistema genera automáticamente el pago mensual como un gasto pendiente de revisión.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isAdmin && (
          <div className="space-y-2">
            <Label>Profesional</Label>
            <Select value={selectedProfessionalId} onValueChange={setSelectedProfessionalId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar profesional" /></SelectTrigger>
              <SelectContent>
                {professionalOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{[p.first_name, p.last_name].filter(Boolean).join(' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!isAdmin && selectedProfessional && (
          <p className="text-sm text-muted-foreground">
            Este es tu acuerdo de compensación actual. Solo un administrador puede modificarlo.
          </p>
        )}

        <fieldset disabled={!isAdmin} className="space-y-6 disabled:opacity-60">
          <div className="space-y-2">
            <Label>Tipo de compensación</Label>
            <RadioGroup value={compensationType} onValueChange={(v) => setCompensationType(v as CompensationType)} className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="fixed" id="comp-fixed" />
                <Label htmlFor="comp-fixed" className="font-normal cursor-pointer">Fijo mensual</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="percentage" id="comp-percentage" />
                <Label htmlFor="comp-percentage" className="font-normal cursor-pointer">% sobre sesiones cobradas/facturadas</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="mixed" id="comp-mixed" />
                <Label htmlFor="comp-mixed" className="font-normal cursor-pointer">Mixto (fijo + %)</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {(compensationType === 'fixed' || compensationType === 'mixed') && (
              <div className="space-y-2">
                <Label>Importe fijo (€)</Label>
                <Input type="number" min={0} step="0.01" value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} />
              </div>
            )}
            {(compensationType === 'percentage' || compensationType === 'mixed') && (
              <div className="space-y-2">
                <Label>% variable</Label>
                <Input type="number" min={0} max={100} step="0.01" value={percentageRate} onChange={(e) => setPercentageRate(e.target.value)} />
              </div>
            )}
          </div>

          {(compensationType === 'percentage' || compensationType === 'mixed') && (
            <div className="space-y-2">
              <Label>Base de cálculo</Label>
              <RadioGroup value={compensationBasis} onValueChange={(v) => setCompensationBasis(v as CompensationBasis)} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="collected_payments" id="basis-collected" />
                  <Label htmlFor="basis-collected" className="font-normal cursor-pointer">Cobros recibidos</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="issued_invoices" id="basis-issued" />
                  <Label htmlFor="basis-issued" className="font-normal cursor-pointer">Facturas emitidas</Label>
                </div>
              </RadioGroup>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Retención IRPF por defecto (%) — opcional</Label>
              <Input type="number" min={0} max={100} step="0.01" value={defaultIrpfRate} onChange={(e) => setDefaultIrpfRate(e.target.value)} placeholder="Sin retención" />
              <p className="text-xs text-muted-foreground">Solo si el profesional factura como autónomo con retención.</p>
            </div>
            <div className="space-y-2">
              <Label>Categoría de gasto asociada</Label>
              <Select value={categoryId || '__default__'} onValueChange={(v) => setCategoryId(v === '__default__' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Pagos a profesionales (por defecto)</SelectItem>
                  {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Vigente desde</Label>
            <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="max-w-[200px]" />
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowHistory((s) => !s)}>
            <Icon name="history" className="h-4 w-4 mr-2" />
            {showHistory ? 'Ocultar histórico' : 'Ver histórico'}
          </Button>
          {isAdmin && (
            <Button onClick={handleSave} disabled={createAgreement.isPending || !selectedProfessionalId}>
              <Icon name="save" className="h-4 w-4 mr-2" />
              Guardar
            </Button>
          )}
        </div>

        {showHistory && history && history.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                <span>
                  {h.compensation_type === 'fixed' && `Fijo: ${h.fixed_amount} €`}
                  {h.compensation_type === 'percentage' && `${h.percentage_rate}%`}
                  {h.compensation_type === 'mixed' && `${h.fixed_amount} € + ${h.percentage_rate}%`}
                </span>
                <span className="text-muted-foreground">
                  {h.effective_from} — {h.effective_to || 'actual'}
                </span>
                {!h.effective_to && <Badge variant="outline">Activo</Badge>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
