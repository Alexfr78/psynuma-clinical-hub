import { useEffect, useRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Icon } from '@/components/ui/icon';
import { PatientSelector } from './PatientSelector';
import { usePatient } from '@/hooks/usePatients';
import { usePatientPartner } from '@/hooks/usePatientRelationships';
import { defaultPayerFor, type CouplePayer } from '@/lib/couple-session';
import type { QuickSessionFormValues } from './QuickCreateSessionDialog';

interface CoupleSessionFieldsProps {
  form: UseFormReturn<QuickSessionFormValues>;
  isCoupleType: boolean;
}

const fullName = (p?: { first_name: string; last_name: string } | null) =>
  p ? `${p.first_name} ${p.last_name}`.trim() : '';

/**
 * Segundo miembro y pagador de una sesión de pareja. Se rellena solo con la
 * pareja vinculada en la ficha; si no hay vínculo, deja elegir a otro contacto.
 */
export function CoupleSessionFields({ form, isCoupleType }: CoupleSessionFieldsProps) {
  const patientId = form.watch('patient_id');
  const partnerId = form.watch('partner_patient_id');
  const payer = form.watch('couple_payer');

  const { data: link } = usePatientPartner(patientId || undefined);
  const { data: patient } = usePatient(patientId || undefined);
  const { data: partner } = usePatient(partnerId || undefined);
  const prefilledFor = useRef<string | null>(null);

  // Al cambiar de contacto (o pasar a un tipo de pareja) se propone su pareja vinculada.
  useEffect(() => {
    if (!isCoupleType) {
      if (form.getValues('partner_patient_id')) form.setValue('partner_patient_id', '');
      prefilledFor.current = null;
      return;
    }
    if (!patientId || link === undefined || prefilledFor.current === patientId) return;
    prefilledFor.current = patientId;
    if (link) {
      form.setValue('partner_patient_id', link.partner.id);
      form.setValue('couple_payer', defaultPayerFor(patientId, link.defaultPayerId));
    } else {
      form.setValue('partner_patient_id', '');
      form.setValue('couple_payer', 'patient');
    }
  }, [isCoupleType, patientId, link, form]);

  if (!isCoupleType || !patientId) return null;

  const linkedPartnerId = link?.partner.id ?? null;
  const isAdHocPartner = !!partnerId && partnerId !== linkedPartnerId;

  return (
    <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon name="favorite" className="h-4 w-4 text-primary" />
        Sesión de pareja
      </div>

      {partner ? (
        <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
          <span>
            Con <span className="font-medium">{fullName(partner)}</span>
            {partnerId === linkedPartnerId && (
              <span className="text-muted-foreground"> · pareja vinculada</span>
            )}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => form.setValue('partner_patient_id', '')}
          >
            Cambiar
          </Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <PatientSelector
            onSelect={(id) => form.setValue('partner_patient_id', id)}
            excludeIds={[patientId]}
            placeholder="Buscar al otro miembro..."
          />
          <p className="text-xs text-muted-foreground">
            Consejo: vincula la pareja en la ficha del contacto y se propondrá sola.
          </p>
        </div>
      )}

      {partner && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Paga y recibe la factura</Label>
          <RadioGroup
            value={payer}
            onValueChange={(v) => form.setValue('couple_payer', v as CouplePayer)}
            className="flex flex-wrap gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="patient" id="couple-payer-patient" />
              <Label htmlFor="couple-payer-patient" className="font-normal">{fullName(patient)}</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="partner" id="couple-payer-partner" />
              <Label htmlFor="couple-payer-partner" className="font-normal">{fullName(partner)}</Label>
            </div>
          </RadioGroup>
          {isAdHocPartner && (
            <p className="text-xs text-muted-foreground">
              Estas dos personas no están vinculadas: la sesión será conjunta, pero no podrán
              compartir bonos hasta que las vincules en la ficha.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
