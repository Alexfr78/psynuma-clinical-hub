import { useState } from 'react';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useConsents, Consent } from '@/hooks/useConsents';
import { CreateConsentDialog } from '@/components/consents/CreateConsentDialog';
import { WhatsAppLinkDialog } from '@/components/agenda/WhatsAppLinkDialog';
import { useWhatsAppDelivery } from '@/hooks/useWhatsAppDelivery';
import { useCenter } from '@/hooks/useCenter';
import { usePatients, Patient } from '@/hooks/usePatients';
import { toast } from 'sonner';
import { Icon } from '@/components/ui/icon';
import { Link } from 'react-router-dom';

export default function Consents() {
  const { consents, isLoading: consentsLoading } = useConsents();
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [patientSearchValue, setPatientSearchValue] = useState('');
  const [sendPatient, setSendPatient] = useState<Patient | null>(null);
  const { data: searchPatients, isLoading: patientsLoading } = usePatients({ search: patientSearchValue });

  // Filter pending consents (not expired)
  const pendingConsents = consents.filter((c) => {
    const isExpired = new Date(c.expires_at) < new Date();
    return c.status === 'pending' && !isExpired;
  });

  const handleSelectPatient = (patient: Patient) => {
    setSendPatient(patient);
    setPatientSearchOpen(false);
    setPatientSearchValue('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">
            Consentimientos Informados
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestiona la documentación legal y firmas de tus pacientes
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/configuracion">
              <Icon name="description" className="mr-2 h-4 w-4" />
              Gestionar plantillas
            </Link>
          </Button>
          <Popover open={patientSearchOpen} onOpenChange={setPatientSearchOpen}>
            <PopoverTrigger asChild>
              <Button size="sm">
                <Icon name="send" className="mr-2 h-4 w-4" />
                Enviar consentimiento
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="end">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Buscar contacto..."
                  value={patientSearchValue}
                  onValueChange={setPatientSearchValue}
                />
                <CommandList>
                  <CommandEmpty>
                    {patientsLoading ? 'Buscando...' : 'No se encontraron contactos.'}
                  </CommandEmpty>
                  <CommandGroup>
                    {searchPatients?.map((patient) => (
                      <CommandItem
                        key={patient.id}
                        value={patient.id}
                        onSelect={() => handleSelectPatient(patient)}
                        className="flex items-center gap-2 py-2"
                      >
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Icon name="person" className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="truncate">{patient.first_name} {patient.last_name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {consentsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : pendingConsents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <div className="rounded-full bg-muted p-4">
            <Icon name="schedule" className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 font-semibold">Sin consentimientos pendientes</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Todos los consentimientos han sido firmados
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pendingConsents.map((consent) => (
            <PendingConsentCard key={consent.id} consent={consent} />
          ))}
        </div>
      )}

      {sendPatient && (
        <CreateConsentDialog
          open={!!sendPatient}
          onOpenChange={(v) => !v && setSendPatient(null)}
          patient={sendPatient}
          onSuccess={() => setSendPatient(null)}
        />
      )}
    </div>
  );
}

// Compact card for pending consents with patient info
function PendingConsentCard({ consent }: { consent: Consent }) {
  const { sendWhatsApp, isAutomatic, methodLabel } = useWhatsAppDelivery();
  const { center } = useCenter();
  const { data: patients = [] } = usePatients();
  const [isSending, setIsSending] = useState(false);
  const [whatsAppDialogOpen, setWhatsAppDialogOpen] = useState(false);
  const [manualLink, setManualLink] = useState('');
  
  const consentUrl = `${window.location.origin}/consentimiento/${consent.access_token}`;
  
  // Get patient phone from patients list
  const patient = patients.find(p => p.id === consent.patient_id);
  const patientPhone = patient?.phone || '';
  const patientName = consent.patient 
    ? `${consent.patient.first_name}` 
    : '';

  const message = `Buenos días${patientName ? ` ${patientName}` : ''}, tal y como te comenté, te adjunto el acuerdo de consentimiento para la protección de datos. Al final de lectura verás que hay tres campos, es necesario que al menos a los dos primeros me des consentimiento.\n\n${consentUrl}\n\nSi tienes cualquier consulta, no dudes en avisarme.`;
  
  const handleCopyLink = () => {
    navigator.clipboard.writeText(consentUrl);
    toast.success('Enlace copiado');
  };

  const handleSendWhatsApp = async () => {
    if (!patientPhone) {
      toast.error('Sin teléfono', {
        description: 'El contacto no tiene número de teléfono registrado.',
      });
      return;
    }

    if (!center?.id) return;

    setIsSending(true);
    try {
      const result = await sendWhatsApp({
        phone: patientPhone,
        message,
        patientId: consent.patient_id,
        patientName: patientName || 'Contacto',
        centerId: center.id,
        messageType: 'consent',
      });

      if (result.manualLink) {
        // Manual mode - show WhatsApp dialog
        setManualLink(result.manualLink);
        setWhatsAppDialogOpen(true);
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border p-4 space-y-3 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">
              {consent.patient?.first_name} {consent.patient?.last_name}
            </p>
            <p className="text-sm text-muted-foreground truncate">
              {consent.template?.name || 'Consentimiento'}
            </p>
          </div>
          <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 shrink-0">
            <Icon name="schedule" className="h-3 w-3 mr-1" />
            Pendiente
          </Badge>
        </div>

        <div className="text-xs text-muted-foreground">
          Creado: {format(new Date(consent.created_at), "d MMM yyyy", { locale: es })}
          <span className="mx-2">•</span>
          Expira: {format(new Date(consent.expires_at), "d MMM", { locale: es })}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={handleCopyLink}
          >
            <Icon name="content_copy" className="h-4 w-4 mr-2" />
            Copiar enlace
          </Button>
          
          {patientPhone && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendWhatsApp}
              disabled={isSending}
              title={methodLabel}
            >
              {isSending ? (
                <Icon name="progress_activity" className="h-4 w-4 animate-spin" />
              ) : isAutomatic ? (
                <Icon name="send" className="h-4 w-4 text-green-500" />
              ) : (
                <Icon name="chat" className="h-4 w-4 text-green-500" />
              )}
            </Button>
          )}
          
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <a href={consentUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="open_in_new" className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>

      {/* WhatsApp Manual Link Dialog */}
      <WhatsAppLinkDialog
        open={whatsAppDialogOpen}
        onOpenChange={setWhatsAppDialogOpen}
        phone={patientPhone}
        message={message}
        patientName={patientName || 'Contacto'}
      />
    </>
  );
}
