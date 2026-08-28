import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Assessment, useAssessments } from '@/hooks/useAssessments';
import { toast } from 'sonner';
import { useState } from 'react';
import { Icon } from '@/components/ui/icon';

interface AssessmentCardProps {
  assessment: Assessment;
  onView: (assessment: Assessment) => void;
  onSend: (assessment: Assessment) => void;
  onRevoke: (assessment: Assessment) => void;
  onDelete: (assessment: Assessment) => void;
}

export function AssessmentCard({ assessment, onView, onSend, onRevoke, onDelete }: AssessmentCardProps) {
  const navigate = useNavigate();
  const { updateExpiration } = useAssessments();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showExpirationDialog, setShowExpirationDialog] = useState(false);
  const [newExpirationDate, setNewExpirationDate] = useState('');

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-assessment-pdf', {
        body: { assessment_id: assessment.id },
      });

      if (error) throw error;
      if (!data?.html) throw new Error('No se pudo generar el PDF');

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(data.html);
        printWindow.document.close();
        // Wait for content to fully render before printing
        // Use longer delay and also wait for document ready state
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print();
          }, 1500);
        };
        // Fallback if onload doesn't fire
        setTimeout(() => {
          if (printWindow.document.readyState === 'complete') {
            printWindow.print();
          }
        }, 2000);
      }
      
      toast.success('PDF generado correctamente');
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast.error('Error al generar el PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  const getStatusBadge = () => {
    const isExpired = new Date(assessment.expires_at) < new Date() && assessment.status === 'pending';

    if (isExpired || assessment.status === 'expired') {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          <Icon name="error" className="w-3 h-3 mr-1" />
          Caducada
        </Badge>
      );
    }

    switch (assessment.status) {
      case 'pending':
        return (
          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
            <Icon name="schedule" className="w-3 h-3 mr-1" />
            Pendiente
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="outline" className="text-green-600 border-green-600">
            <Icon name="check_circle" className="w-3 h-3 mr-1" />
            Completada
          </Badge>
        );
      case 'revoked':
        return (
          <Badge variant="outline" className="text-red-600 border-red-600">
            <Icon name="cancel" className="w-3 h-3 mr-1" />
            Revocada
          </Badge>
        );
      default:
        return null;
    }
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/evaluacion/${assessment.access_token}`;
    navigator.clipboard.writeText(link);
    toast.success('Enlace copiado al portapapeles');
  };

  const handleDelete = () => {
    onDelete(assessment);
    setShowDeleteDialog(false);
  };

  const openExpirationDialog = () => {
    // Format current expiration as YYYY-MM-DD for date input
    const d = new Date(assessment.expires_at);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setNewExpirationDate(iso);
    setShowExpirationDialog(true);
  };

  const handleSaveExpiration = async () => {
    if (!newExpirationDate) {
      toast.error('Selecciona una fecha válida');
      return;
    }
    // Set to end of day so the assessment is valid for the full selected day
    const expiresAt = new Date(`${newExpirationDate}T23:59:59`).toISOString();
    try {
      await updateExpiration.mutateAsync({ id: assessment.id, expires_at: expiresAt });
      setShowExpirationDialog(false);
    } catch {
      // toast handled in hook
    }
  };

  const isPending = assessment.status === 'pending' && new Date(assessment.expires_at) > new Date();
  const isExpired = assessment.status === 'expired' || (assessment.status === 'pending' && new Date(assessment.expires_at) < new Date());
  const canEditExpiration = isPending || isExpired;

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h4 className="font-medium break-words">
                  {assessment.patient?.first_name} {assessment.patient?.last_name}
                </h4>
                {getStatusBadge()}
              </div>
              <p className="text-sm text-muted-foreground mb-2 break-words">
                {assessment.template?.name}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Creada: {format(new Date(assessment.created_at), 'dd MMM yyyy', { locale: es })}</span>
                {assessment.sent_at && (
                  <span>Enviada: {format(new Date(assessment.sent_at), 'dd MMM yyyy', { locale: es })}</span>
                )}
                <span>Caduca: {format(new Date(assessment.expires_at), 'dd MMM yyyy', { locale: es })}</span>
                {assessment.completed_at && (
                  <span>Completada: {format(new Date(assessment.completed_at), 'dd MMM yyyy', { locale: es })}</span>
                )}
              </div>
            </div>

            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0">
                  <Icon name="more_vert" className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" usePortal={false}>
                {assessment.status === 'completed' && (
                  <>
                    <DropdownMenuItem onClick={() => navigate(`/evaluaciones/${assessment.id}/resultados`)}>
                      <Icon name="visibility" className="h-4 w-4 mr-2" />
                      Ver resultados
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownloadPDF} disabled={isDownloading}>
                      {isDownloading ? (
                        <Icon name="progress_activity" className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Icon name="download" className="h-4 w-4 mr-2" />
                      )}
                      Descargar PDF
                    </DropdownMenuItem>
                  </>
                )}
                {isPending && (
                  <>
                    <DropdownMenuItem onClick={() => onSend(assessment)}>
                      <Icon name="send" className="h-4 w-4 mr-2" />
                      Enviar enlace
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleCopyLink}>
                      <Icon name="content_copy" className="h-4 w-4 mr-2" />
                      Copiar enlace
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onRevoke(assessment)} className="text-destructive">
                      <Icon name="block" className="h-4 w-4 mr-2" />
                      Revocar
                    </DropdownMenuItem>
                  </>
                )}
                {canEditExpiration && (
                  <DropdownMenuItem onClick={openExpirationDialog}>
                    <Icon name="event" className="h-4 w-4 mr-2" />
                    Cambiar caducidad
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-destructive">
                  <Icon name="delete" className="h-4 w-4 mr-2" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar evaluación?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente la evaluación y sus respuestas asociadas. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showExpirationDialog} onOpenChange={setShowExpirationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar fecha de caducidad</DialogTitle>
            <DialogDescription>
              Selecciona la nueva fecha hasta la que el contacto podrá completar la evaluación.
              {isExpired && ' Si eliges una fecha futura, la evaluación volverá a estado pendiente.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="new-expiration-date">Nueva fecha de caducidad</Label>
            <Input
              id="new-expiration-date"
              type="date"
              value={newExpirationDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setNewExpirationDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExpirationDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveExpiration} disabled={updateExpiration.isPending}>
              {updateExpiration.isPending && <Icon name="progress_activity" className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

