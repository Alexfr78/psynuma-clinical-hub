import { useState } from 'react';
import { ResponsiveDialog as Dialog, ResponsiveDialogContent as DialogContent, ResponsiveDialogHeader as DialogHeader, ResponsiveDialogTitle as DialogTitle } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePatients } from '@/hooks/usePatients';
import { useAssessmentTemplates } from '@/hooks/useAssessmentTemplates';
import { useAssessments } from '@/hooks/useAssessments';
import { useWhatsAppDelivery } from '@/hooks/useWhatsAppDelivery';
import { useCenter } from '@/hooks/useCenter';
import { WhatsAppLinkDialog } from '@/components/agenda/WhatsAppLinkDialog';
import { Loader2, Check, ChevronsUpDown, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface CreateAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedPatientId?: string;
}

export function CreateAssessmentDialog({ open, onOpenChange, preselectedPatientId }: CreateAssessmentDialogProps) {
  const [searchValue, setSearchValue] = useState('');
  const [patientPopoverOpen, setPatientPopoverOpen] = useState(false);
  const { data: patients = [] } = usePatients({ search: searchValue });
  const { templates } = useAssessmentTemplates();
  const { createAssessment, resendAssessment } = useAssessments();
  const { sendWhatsApp } = useWhatsAppDelivery();
  const { center } = useCenter();
  
  const [patientId, setPatientId] = useState(preselectedPatientId || '');
  const [templateId, setTemplateId] = useState('');
  const [sendVia, setSendVia] = useState<'email' | 'whatsapp' | 'none'>('none');

  // WhatsApp manual fallback state
  const [whatsAppDialogOpen, setWhatsAppDialogOpen] = useState(false);
  const [manualLink, setManualLink] = useState('');
  const [manualMessage, setManualMessage] = useState('');
  const [manualPatientName, setManualPatientName] = useState('');

  const selectedPatient = patients.find(p => p.id === patientId);
  const sendTo = sendVia === 'email' ? selectedPatient?.email : sendVia === 'whatsapp' ? selectedPatient?.phone : undefined;

  const handleSubmit = async () => {
    if (!patientId || !templateId) return;

    const result = await createAssessment.mutateAsync({
      patient_id: patientId,
      template_id: templateId,
      sent_via: sendVia !== 'none' ? sendVia : undefined,
      sent_to: sendTo || undefined,
    });

    // If WhatsApp selected, trigger real send
    if (sendVia === 'whatsapp' && selectedPatient?.phone && center?.id && result) {
      const assessmentLink = `${window.location.origin}/evaluacion/${result.access_token}`;
      const patientName = selectedPatient.first_name || 'Contacto';
      const message = `Hola${patientName ? ` ${patientName}` : ''}, te envío el siguiente cuestionario para que lo completes cuando puedas:\n\n${assessmentLink}\n\nSi tienes cualquier duda, no dudes en consultarme.`;

      const sendResult = await sendWhatsApp({
        phone: selectedPatient.phone,
        message,
        patientId,
        patientName,
        centerId: center.id,
        messageType: 'assessment',
      });

      if (sendResult.manualLink) {
        // Manual mode - show WhatsApp dialog after closing create dialog
        setManualLink(sendResult.manualLink);
        setManualMessage(message);
        setManualPatientName(patientName);
        onOpenChange(false);
        resetForm();
        setWhatsAppDialogOpen(true);
        return;
      }

      // If auto sent, update sent_at
      if (sendResult.result.autoSent) {
        await resendAssessment.mutateAsync({
          id: result.id,
          sent_via: 'whatsapp',
          sent_to: selectedPatient.phone,
        });
      }
    }

    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setPatientId(preselectedPatientId || '');
    setTemplateId('');
    setSendVia('none');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Evaluación</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Contacto</Label>
              <Popover open={patientPopoverOpen} onOpenChange={setPatientPopoverOpen} modal={false}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={patientPopoverOpen}
                    className="w-full justify-between font-normal"
                    disabled={!!preselectedPatientId}
                  >
                    {selectedPatient ? (
                      <span>{selectedPatient.first_name} {selectedPatient.last_name}</span>
                    ) : (
                      <span className="text-muted-foreground">Buscar contacto...</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[9999] pointer-events-auto" align="start" data-vaul-no-drag>
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Buscar por nombre..."
                      value={searchValue}
                      onValueChange={setSearchValue}
                    />
                    <CommandList>
                      <CommandEmpty>No se encontraron contactos.</CommandEmpty>
                      <CommandGroup>
                        {patients.map((patient) => (
                          <CommandItem
                            key={patient.id}
                            value={patient.id}
                            onSelect={() => {
                              setPatientId(patient.id);
                              setPatientPopoverOpen(false);
                              setSearchValue('');
                            }}
                            className="flex items-center gap-2"
                          >
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <User className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <div className="flex-1 overflow-hidden">
                              <p className="truncate">
                                {patient.first_name} {patient.last_name}
                              </p>
                              {patient.email && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {patient.email}
                                </p>
                              )}
                            </div>
                            <Check
                              className={cn(
                                "h-4 w-4 shrink-0",
                                patientId === patient.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Plantilla de evaluación</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una plantilla" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Enviar por (opcional)</Label>
              <Select value={sendVia} onValueChange={(v) => setSendVia(v as 'email' | 'whatsapp' | 'none')}>
                <SelectTrigger>
                  <SelectValue placeholder="Solo generar enlace" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Solo generar enlace</SelectItem>
                  <SelectItem value="email" disabled={!selectedPatient?.email}>Email</SelectItem>
                  <SelectItem value="whatsapp" disabled={!selectedPatient?.phone}>WhatsApp</SelectItem>
                </SelectContent>
              </Select>
              {sendVia !== 'none' && sendTo && (
                <p className="text-sm text-muted-foreground">Se enviará a: {sendTo}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={!patientId || !templateId || createAssessment.isPending}>
                {createAssessment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Crear evaluación
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <WhatsAppLinkDialog
        open={whatsAppDialogOpen}
        onOpenChange={setWhatsAppDialogOpen}
        phone={selectedPatient?.phone || ''}
        message={manualMessage}
        patientName={manualPatientName}
      />
    </>
  );
}
