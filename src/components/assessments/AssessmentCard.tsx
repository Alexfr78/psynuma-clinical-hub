import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { Clock, CheckCircle2, XCircle, AlertCircle, MoreVertical, Send, Copy, Eye, Ban, Trash2 } from 'lucide-react';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Assessment } from '@/hooks/useAssessments';
import { toast } from 'sonner';
import { useState } from 'react';

interface AssessmentCardProps {
  assessment: Assessment;
  onView: (assessment: Assessment) => void;
  onSend: (assessment: Assessment) => void;
  onRevoke: (assessment: Assessment) => void;
  onDelete: (assessment: Assessment) => void;
}

export function AssessmentCard({ assessment, onView, onSend, onRevoke, onDelete }: AssessmentCardProps) {
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const getStatusBadge = () => {
    const isExpired = new Date(assessment.expires_at) < new Date() && assessment.status === 'pending';

    if (isExpired || assessment.status === 'expired') {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          <AlertCircle className="w-3 h-3 mr-1" />
          Caducada
        </Badge>
      );
    }

    switch (assessment.status) {
      case 'pending':
        return (
          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
            <Clock className="w-3 h-3 mr-1" />
            Pendiente
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="outline" className="text-green-600 border-green-600">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Completada
          </Badge>
        );
      case 'revoked':
        return (
          <Badge variant="outline" className="text-red-600 border-red-600">
            <XCircle className="w-3 h-3 mr-1" />
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

  const isPending = assessment.status === 'pending' && new Date(assessment.expires_at) > new Date();

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium truncate">
                  {assessment.patient?.first_name} {assessment.patient?.last_name}
                </h4>
                {getStatusBadge()}
              </div>
              <p className="text-sm text-muted-foreground mb-2">
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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {assessment.status === 'completed' && (
                  <DropdownMenuItem onClick={() => navigate(`/evaluaciones/${assessment.id}/resultados`)}>
                    <Eye className="h-4 w-4 mr-2" />
                    Ver resultados
                  </DropdownMenuItem>
                )}
                {isPending && (
                  <>
                    <DropdownMenuItem onClick={() => onSend(assessment)}>
                      <Send className="h-4 w-4 mr-2" />
                      Enviar enlace
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleCopyLink}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar enlace
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onRevoke(assessment)} className="text-destructive">
                      <Ban className="h-4 w-4 mr-2" />
                      Revocar
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
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
    </>
  );
}
