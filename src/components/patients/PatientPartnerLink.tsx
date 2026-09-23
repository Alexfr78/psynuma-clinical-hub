import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Icon } from '@/components/ui/icon';
import { PatientSelector } from '@/components/agenda/PatientSelector';
import { useToast } from '@/hooks/use-toast';
import { usePatient } from '@/hooks/usePatients';
import {
  useLinkPartner,
  usePatientPartner,
  useUnlinkPartner,
  useUpdateCoupleLink,
} from '@/hooks/usePatientRelationships';

interface PatientPartnerLinkProps {
  patient: { id: string; first_name: string; last_name: string };
}

const fullName = (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`.trim();

export function PatientPartnerLink({ patient }: PatientPartnerLinkProps) {
  const { toast } = useToast();
  const { data: link, isLoading } = usePatientPartner(patient.id);
  const linkPartner = useLinkPartner();
  const updateLink = useUpdateCoupleLink();
  const unlink = useUnlinkPartner();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmUnlinkOpen, setConfirmUnlinkOpen] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [payerChoice, setPayerChoice] = useState<'self' | 'partner' | 'none'>('self');
  const { data: selectedPartner } = usePatient(selectedPartnerId ?? undefined);

  const onError = (error: unknown) =>
    toast({
      title: 'No se pudo guardar',
      description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      variant: 'destructive',
    });

  const resetDialog = () => {
    setSelectedPartnerId(null);
    setPayerChoice('self');
  };

  const handleLink = async () => {
    if (!selectedPartnerId) return;
    const defaultPayerId =
      payerChoice === 'self' ? patient.id : payerChoice === 'partner' ? selectedPartnerId : null;
    try {
      await linkPartner.mutateAsync({ patientId: patient.id, partnerId: selectedPartnerId, defaultPayerId });
      toast({ title: 'Pareja vinculada' });
      setDialogOpen(false);
      resetDialog();
    } catch (error) {
      onError(error);
    }
  };

  if (isLoading) return null;

  if (!link) {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-primary"
          onClick={() => setDialogOpen(true)}
        >
          <Icon name="group_add" className="mr-1.5 h-4 w-4" />
          Vincular pareja
        </Button>

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetDialog();
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Vincular pareja</DialogTitle>
              <DialogDescription>
                Las sesiones de pareja avisarán a los dos y podrán compartir bonos. Las sesiones
                individuales de cada uno siguen siendo solo suyas.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {selectedPartner ? (
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="font-medium">{fullName(selectedPartner)}</span>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedPartnerId(null)}>
                    Cambiar
                  </Button>
                </div>
              ) : (
                <PatientSelector
                  onSelect={setSelectedPartnerId}
                  excludeIds={[patient.id]}
                  placeholder="Buscar a la pareja..."
                />
              )}

              {selectedPartner && (
                <div className="space-y-2">
                  <Label>¿Quién paga por defecto las sesiones de pareja?</Label>
                  <RadioGroup
                    value={payerChoice}
                    onValueChange={(v) => setPayerChoice(v as typeof payerChoice)}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="self" id="payer-self" />
                      <Label htmlFor="payer-self" className="font-normal">{fullName(patient)}</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="partner" id="payer-partner" />
                      <Label htmlFor="payer-partner" className="font-normal">{fullName(selectedPartner)}</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="none" id="payer-none" />
                      <Label htmlFor="payer-none" className="font-normal">Decidirlo en cada sesión</Label>
                    </div>
                  </RadioGroup>
                  <p className="text-xs text-muted-foreground">
                    La factura de cada sesión conjunta va a nombre de una sola persona.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleLink} disabled={!selectedPartnerId || linkPartner.isPending}>
                {linkPartner.isPending ? 'Vinculando...' : 'Vincular'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  const { partner, relationship, defaultPayerId } = link;
  const payerLabel =
    defaultPayerId === patient.id
      ? fullName(patient)
      : defaultPayerId === partner.id
        ? fullName(partner)
        : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm sm:justify-start">
        <Icon name="favorite" className="h-4 w-4 text-primary" />
        <span className="text-muted-foreground">Pareja:</span>
        <Link to={`/pacientes/${partner.id}`} className="font-medium text-primary hover:underline">
          {fullName(partner)}
        </Link>
        {payerLabel && (
          <span className="text-xs text-muted-foreground">· Paga por defecto: {payerLabel}</span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Opciones de pareja">
              <Icon name="more_horiz" className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              disabled={defaultPayerId === patient.id}
              onClick={() => updateLink.mutateAsync({ relationship, defaultPayerId: patient.id }).catch(onError)}
            >
              Paga por defecto: {fullName(patient)}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={defaultPayerId === partner.id}
              onClick={() => updateLink.mutateAsync({ relationship, defaultPayerId: partner.id }).catch(onError)}
            >
              Paga por defecto: {fullName(partner)}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={defaultPayerId === null}
              onClick={() => updateLink.mutateAsync({ relationship, defaultPayerId: null }).catch(onError)}
            >
              Decidirlo en cada sesión
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => setConfirmUnlinkOpen(true)}>
              Desvincular
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmUnlinkOpen} onOpenChange={setConfirmUnlinkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desvincular a {fullName(partner)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Las sesiones de pareja ya creadas se conservan con sus dos participantes. A partir de
              ahora no se propondrá a esta persona como pareja ni se podrán compartir bonos nuevos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                unlink
                  .mutateAsync(relationship)
                  .then(() => toast({ title: 'Pareja desvinculada' }))
                  .catch(onError)
              }
            >
              Desvincular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
