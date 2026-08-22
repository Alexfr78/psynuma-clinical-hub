import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ClipboardCheck, FileCheck2, FileSignature, FileText, Loader2, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { redirectTopLevel } from '@/lib/redirect';

export interface PortalDocument {
  id: string;
  type: 'consent' | 'assessment' | 'autoregistro';
  title: string;
  status: 'pending' | 'in_progress' | 'signed' | 'completed' | 'expired' | 'revoked';
  createdAt: string | null;
  expiresAt: string | null;
  completedAt: string | null;
  actionPath: string | null;
  submissionCount?: number;
  allowMultiple?: boolean;
}

interface PortalDocumentsProps {
  documents: PortalDocument[];
  loading: boolean;
}

const typeConfig = {
  consent: { label: 'Consentimiento', icon: FileSignature },
  assessment: { label: 'Evaluación', icon: ClipboardCheck },
  autoregistro: { label: 'Autorregistro', icon: FileText },
};

const statusConfig = {
  pending: { label: 'Pendiente', variant: 'default' as const },
  in_progress: { label: 'En curso', variant: 'outline' as const },
  signed: { label: 'Firmado', variant: 'secondary' as const },
  completed: { label: 'Completado', variant: 'secondary' as const },
  expired: { label: 'Caducado', variant: 'outline' as const },
  revoked: { label: 'Revocado', variant: 'destructive' as const },
};

function displayDate(value: string) {
  return format(new Date(value), "d 'de' MMMM 'de' yyyy", { locale: es });
}

export function PortalDocuments({ documents, loading }: PortalDocumentsProps) {
  if (loading) return <div className="flex min-h-40 items-center justify-center" role="status"><Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" /><span className="text-sm text-muted-foreground">Cargando documentos...</span></div>;
  if (documents.length === 0) return <div className="flex flex-col items-center rounded-xl border border-dashed px-4 py-12 text-center"><FileCheck2 className="h-10 w-10 text-muted-foreground" aria-hidden="true" /><h2 className="mt-4 text-lg font-semibold">No tienes documentos</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Cuando tu profesional te envíe un consentimiento, evaluación o autorregistro, aparecerá aquí.</p></div>;

  const pending = documents.filter((document) => ['pending', 'in_progress'].includes(document.status));
  const completed = documents.filter((document) => !['pending', 'in_progress'].includes(document.status));

  const renderDocument = (document: PortalDocument) => {
    const type = typeConfig[document.type];
    const status = statusConfig[document.status] || statusConfig.pending;
    const TypeIcon = type.icon;
    const actionLabel = document.type === 'consent' ? (document.status === 'signed' ? 'Consultar' : 'Firmar') : document.type === 'assessment' ? 'Completar evaluación' : document.submissionCount ? 'Nuevo registro' : 'Completar registro';
    return <Card key={`${document.type}-${document.id}`}><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div className="flex min-w-0 gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><TypeIcon className="h-5 w-5" aria-hidden="true" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{document.title}</p><Badge variant={status.variant}>{status.label}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{type.label}{document.type === 'autoregistro' && document.submissionCount ? ` - ${document.submissionCount} envío${document.submissionCount === 1 ? '' : 's'}` : ''}</p><p className="mt-1 text-xs text-muted-foreground">{document.completedAt ? `Última actividad: ${displayDate(document.completedAt)}` : document.expiresAt ? `Disponible hasta ${displayDate(document.expiresAt)}` : document.createdAt ? `Recibido el ${displayDate(document.createdAt)}` : ''}</p></div></div>{document.actionPath && <Button className="min-h-11 shrink-0" variant={document.status === 'signed' ? 'outline' : 'default'} onClick={() => redirectTopLevel(document.actionPath!)}>{document.type === 'autoregistro' && document.submissionCount ? <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> : <TypeIcon className="mr-2 h-4 w-4" aria-hidden="true" />}{actionLabel}</Button>}</CardContent></Card>;
  };

  return <div className="space-y-6">{pending.length > 0 && <section aria-labelledby="pending-documents" className="space-y-3"><div><h2 id="pending-documents" className="text-lg font-semibold">Pendientes</h2><p className="mt-1 text-sm text-muted-foreground">Documentos que requieren tu atención</p></div>{pending.map(renderDocument)}</section>}<section aria-labelledby="document-history" className="space-y-3"><div><h2 id="document-history" className="text-lg font-semibold">Historial</h2><p className="mt-1 text-sm text-muted-foreground">Documentos completados, caducados o revocados</p></div>{completed.length > 0 ? completed.map(renderDocument) : <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Todavía no hay documentos en el historial.</p>}</section></div>;
}
