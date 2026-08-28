import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

import type { IntakeRequest } from '@/hooks/useIntakeRequests';
import { Icon } from '@/components/ui/icon';

interface IntakeRequestDetailDialogProps {
  request: IntakeRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMarkContacted: (id: string) => Promise<void>;
  onMarkClosed: (id: string) => Promise<void>;
  onUpdateNotes: (id: string, notes: string) => Promise<void>;
  loading?: boolean;
}

export function IntakeRequestDetailDialog({
  request,
  open,
  onOpenChange,
  onMarkContacted,
  onMarkClosed,
  onUpdateNotes,
  loading = false,
}: IntakeRequestDetailDialogProps) {
  const [internalNotes, setInternalNotes] = useState(request?.internal_notes || '');
  const [saving, setSaving] = useState(false);

  // Update internal notes when request changes
  useState(() => {
    setInternalNotes(request?.internal_notes || '');
  });

  if (!request) return null;

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await onUpdateNotes(request.id, internalNotes);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkContacted = async () => {
    await onMarkContacted(request.id);
  };

  const handleMarkClosed = async () => {
    await onMarkClosed(request.id);
  };

  const statusBadge = {
    pending: <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">Pendiente</Badge>,
    contacted: <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Contactado</Badge>,
    converted: <Badge variant="outline" className="bg-success/10 text-success border-success/30">Convertido</Badge>,
    cancelled: <Badge variant="outline" className="bg-muted text-muted-foreground">Cerrado</Badge>,
  };

  const typeBadge = request.request_type === 'waitlist' 
    ? <Badge variant="secondary"><Icon name="schedule" className="h-3 w-3 mr-1" />Lista de espera</Badge>
    : <Badge variant="secondary"><Icon name="group" className="h-3 w-3 mr-1" />Derivación</Badge>;

  const referralContext = request.referral_context as Record<string, any> | null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {request.first_name} {request.last_name}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 pt-1">
            {typeBadge}
            {statusBadge[request.status]}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Contact Info */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Contacto</h4>
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Icon name="mail" className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${request.email}`} className="text-primary hover:underline">
                  {request.email}
                </a>
              </div>
              {request.phone && (
                <div className="flex items-center gap-2">
                  <Icon name="call" className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${request.phone}`} className="text-primary hover:underline">
                    {request.phone}
                  </a>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Request Details */}
          {request.request_type === 'referral' && (
            <>
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Criterios de búsqueda</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {request.modality && (
                    <div className="flex items-center gap-2">
                      <Icon name="public" className="h-4 w-4 text-muted-foreground" />
                      <span className="capitalize">{request.modality}</span>
                    </div>
                  )}
                  {request.specialty && (
                    <div className="flex items-center gap-2">
                      <Icon name="task" className="h-4 w-4 text-muted-foreground" />
                      <span>{request.specialty}</span>
                    </div>
                  )}
                  {(referralContext?.province || referralContext?.city) && (
                    <div className="flex items-center gap-2 col-span-2">
                      <Icon name="location_on" className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {[referralContext?.city, referralContext?.province]
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    </div>
                  )}
                </div>
                {request.selected_partner_id && (
                  <p className="text-xs text-muted-foreground">
                    Profesional seleccionado: {request.selected_partner_id}
                  </p>
                )}
              </div>
              <Separator />
            </>
          )}

          {/* User Notes */}
          {request.notes && (
            <>
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Notas del usuario</h4>
                <p className="text-sm bg-muted/50 p-3 rounded-md">{request.notes}</p>
              </div>
              <Separator />
            </>
          )}

          {/* Privacy */}
          <div className="flex items-center gap-2 text-sm">
            <Icon name="shield" className="h-4 w-4 text-muted-foreground" />
            {request.privacy_accepted ? (
              <span className="text-success flex items-center gap-1">
                <Icon name="check_circle" className="h-3 w-3" />
                RGPD aceptado el {request.privacy_accepted_at 
                  ? format(new Date(request.privacy_accepted_at), "d MMM yyyy 'a las' HH:mm", { locale: es })
                  : ''}
              </span>
            ) : (
              <span className="text-muted-foreground">Sin aceptación RGPD</span>
            )}
          </div>

          <Separator />

          {/* Internal Notes */}
          <div className="space-y-2">
            <Label htmlFor="internal-notes" className="text-sm font-medium text-muted-foreground">
              Notas internas
            </Label>
            <Textarea
              id="internal-notes"
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Añade notas internas sobre esta solicitud..."
              rows={3}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveNotes}
              disabled={saving || internalNotes === request.internal_notes}
            >
              {saving ? <Icon name="progress_activity" className="h-4 w-4 animate-spin mr-1" /> : <Icon name="forum" className="h-4 w-4 mr-1" />}
              Guardar notas
            </Button>
          </div>

          <Separator />

          {/* Metadata */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Recibido: {format(new Date(request.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}</p>
            {request.handled_at && (
              <p>Gestionado: {format(new Date(request.handled_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {request.status === 'pending' && (
              <Button 
                onClick={handleMarkContacted} 
                disabled={loading}
                className="flex-1"
              >
                <Icon name="check_circle" className="h-4 w-4 mr-2" />
                Marcar contactado
              </Button>
            )}
            {request.status !== 'cancelled' && (
              <Button 
                variant="outline" 
                onClick={handleMarkClosed} 
                disabled={loading}
                className="flex-1"
              >
                <Icon name="cancel" className="h-4 w-4 mr-2" />
                Cerrar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
