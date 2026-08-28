import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Icon } from '@/components/ui/icon';

interface DeletePatientGDPRDialogProps {
  patientId: string;
  patientName: string;
}

export function DeletePatientGDPRDialog({ patientId, patientName }: DeletePatientGDPRDialogProps) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('delete_patient_gdpr', {
        p_patient_id: patientId,
      });
      if (error) throw error;
      return data as { success: boolean; patient_name: string; deleted: Record<string, number> };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['bonos'] });

      const deleted = data?.deleted;
      const parts: string[] = [];
      if (deleted?.sessions) parts.push(`${deleted.sessions} sesiones`);
      if (deleted?.invoices) parts.push(`${deleted.invoices} facturas`);
      if (deleted?.payments) parts.push(`${deleted.payments} pagos`);
      if (deleted?.bonos) parts.push(`${deleted.bonos} bonos`);
      if (deleted?.assessments) parts.push(`${deleted.assessments} evaluaciones`);
      if (deleted?.consents) parts.push(`${deleted.consents} consentimientos`);

      toast.success(
        `Contacto eliminado correctamente${parts.length ? '. Se eliminaron: ' + parts.join(', ') : ''}`
      );
      navigate('/pacientes');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Error al eliminar el contacto');
    },
  });

  const confirmRequired = 'ELIMINAR';
  const canConfirm = confirmText === confirmRequired;

  return (
    <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirmText(''); }}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" className="gap-2">
          <Icon name="delete" className="h-4 w-4" />
          Eliminar contacto (RGPD)
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <Icon name="gpp_maybe" className="h-5 w-5" />
            Eliminar contacto — Derecho de supresión (RGPD)
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Estás a punto de eliminar permanentemente a <strong>{patientName}</strong> y
                todos sus datos asociados:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Sesiones e historial clínico</li>
                <li>Facturas, pagos y deudas</li>
                <li>Bonos</li>
                <li>Evaluaciones y resultados</li>
                <li>Consentimientos firmados</li>
                <li>Autoregistros</li>
              </ul>
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex gap-2">
                <Icon name="warning" className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">
                  Esta acción es <strong>irreversible</strong>. Todos los datos serán eliminados
                  permanentemente y no se podrán recuperar.
                </p>
              </div>
              <div className="pt-2">
                <p className="text-sm font-medium mb-2">
                  Escribe <strong>{confirmRequired}</strong> para confirmar:
                </p>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={confirmRequired}
                  className="font-mono"
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate()}
            disabled={!canConfirm || deleteMutation.isPending}
          >
            {deleteMutation.isPending && <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />}
            Eliminar permanentemente
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
