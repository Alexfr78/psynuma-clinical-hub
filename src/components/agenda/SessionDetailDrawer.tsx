import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  User,
  CreditCard,
  ChevronDown,
  ChevronRight,
  Mail,
  MessageSquare,
  Phone,
  FileText,
  Link as LinkIcon,
  Edit2,
  X,
  Check,
  XCircle,
  Loader2,
  Package,
  DoorOpen,
  Plus,
  ExternalLink,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { SessionWithRelations, useUpdateSession } from '@/hooks/useSessions';

interface SessionDetailDrawerProps {
  session: SessionWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  draft: { label: 'Borrador', variant: 'outline', className: 'border-dashed' },
  scheduled: { label: 'Programada', variant: 'secondary', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  confirmed: { label: 'Confirmada', variant: 'default', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  completed: { label: 'Completada', variant: 'outline', className: 'bg-muted' },
  cancelled: { label: 'Cancelada', variant: 'destructive', className: '' },
  no_show: { label: 'No asistió', variant: 'destructive', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
};

const sessionTypeLabels: Record<string, string> = {
  individual: 'Sesión individual',
  pareja: 'Terapia de pareja',
  familia: 'Terapia familiar',
  grupo: 'Terapia grupal',
  online: 'Sesión online',
};

export function SessionDetailDrawer({ session, open, onOpenChange }: SessionDetailDrawerProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const updateSession = useUpdateSession();
  const [isUpdating, setIsUpdating] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [priceValue, setPriceValue] = useState('');
  const [notesValue, setNotesValue] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);

  if (!session) return null;

  const status = statusConfig[session.status as keyof typeof statusConfig] || statusConfig.scheduled;
  const patientName = session.patient
    ? `${session.patient.first_name} ${session.patient.last_name}`
    : 'Sin paciente';

  const handleStatusChange = async (newStatus: string) => {
    setIsUpdating(true);
    try {
      await updateSession.mutateAsync({
        id: session.id,
        status: newStatus as any,
      });
      toast({
        title: 'Estado actualizado',
        description: 'El estado de la sesión se ha actualizado.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado.',
        variant: 'destructive',
      });
    }
    setIsUpdating(false);
  };

  const handlePriceSave = async () => {
    try {
      await updateSession.mutateAsync({
        id: session.id,
        price: parseFloat(priceValue),
      });
      toast({ title: 'Precio actualizado' });
      setEditingPrice(false);
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleNotesSave = async () => {
    try {
      await updateSession.mutateAsync({
        id: session.id,
        notes: notesValue,
      });
      toast({ title: 'Notas guardadas' });
      setEditingNotes(false);
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleRoomSave = async (room: string) => {
    try {
      await updateSession.mutateAsync({
        id: session.id,
        room,
      });
      toast({ title: 'Despacho actualizado' });
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const quickActions = [
    {
      status: 'confirmed',
      label: 'Confirmar',
      icon: Check,
      show: session.status === 'scheduled' || session.status === 'draft',
    },
    {
      status: 'completed',
      label: 'Completar',
      icon: Check,
      show: ['scheduled', 'confirmed'].includes(session.status || ''),
    },
    {
      status: 'cancelled',
      label: 'Cancelar',
      icon: X,
      show: ['scheduled', 'confirmed', 'draft'].includes(session.status || ''),
    },
    {
      status: 'no_show',
      label: 'No asistió',
      icon: XCircle,
      show: ['scheduled', 'confirmed'].includes(session.status || ''),
    },
  ].filter((a) => a.show);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[520px] p-0 overflow-y-auto">
        <SheetHeader className="px-6 pt-6 pb-4 sticky top-0 bg-background z-10 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold">Detalle de sesión</SheetTitle>
            <Badge className={cn(status.className)} variant={status.variant}>
              {status.label}
            </Badge>
          </div>
        </SheetHeader>

        <Tabs defaultValue="info" className="w-full">
          <TabsList className="w-full justify-start px-6 rounded-none border-b bg-transparent h-auto p-0">
            <TabsTrigger
              value="info"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
            >
              Info
            </TabsTrigger>
            <TabsTrigger
              value="historial"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
            >
              Historial
            </TabsTrigger>
            <TabsTrigger
              value="sms"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
            >
              SMS enviados
            </TabsTrigger>
            <TabsTrigger
              value="otras"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
            >
              Otras sesiones
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="mt-0 px-6 py-4 space-y-6">
            {/* Patient Card */}
            <div
              className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted transition-colors group"
              onClick={() => {
                if (session.patient) {
                  navigate(`/pacientes/${session.patient.id}`);
                  onOpenChange(false);
                }
              }}
            >
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{patientName}</h3>
                {session.patient?.email && (
                  <p className="text-sm text-muted-foreground">{session.patient.email}</p>
                )}
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* Tags */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Añadir etiqueta
              </Button>
            </div>

            <Separator />

            {/* Session Details */}
            <div className="space-y-4">
              {/* Date & Time */}
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium capitalize">
                    {format(new Date(session.session_date), "EEEE, d 'de' MMMM yyyy", { locale: es })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {session.start_time?.slice(0, 5)} - {session.end_time?.slice(0, 5)}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Edit2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Professional */}
              {session.professional && (
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <p className="flex-1">
                    {session.professional.first_name} {session.professional.last_name}
                  </p>
                </div>
              )}

              {/* Session Type */}
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 flex items-center gap-2">
                  <span>{sessionTypeLabels[session.session_type || 'individual'] || session.session_type}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              {/* Bono */}
              {session.bono_id && (
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  <Badge variant="secondary">Bono aplicado</Badge>
                </div>
              )}

              {/* Room */}
              <div className="flex items-center gap-3">
                <DoorOpen className="h-5 w-5 text-muted-foreground" />
                <Select
                  value={(session as any).room || ''}
                  onValueChange={handleRoomSave}
                >
                  <SelectTrigger className="w-40 h-8">
                    <SelectValue placeholder="Sin despacho" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="despacho-1">Despacho 1</SelectItem>
                    <SelectItem value="despacho-2">Despacho 2</SelectItem>
                    <SelectItem value="despacho-3">Despacho 3</SelectItem>
                    <SelectItem value="sala-espera">Sala de espera</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Payment Section */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">Pago</h4>

              {/* Price */}
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
                {editingPrice ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      className="w-24 h-8"
                      value={priceValue}
                      onChange={(e) => setPriceValue(e.target.value)}
                      autoFocus
                    />
                    <span className="text-sm">€</span>
                    <Button size="sm" variant="ghost" onClick={handlePriceSave}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingPrice(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{Number(session.price).toFixed(2)}€</span>
                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                      Pendiente de pago
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        setPriceValue(session.price?.toString() || '0');
                        setEditingPrice(true);
                      }}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline">
                  <FileText className="h-4 w-4 mr-1" />
                  Crear factura
                </Button>
                <Button size="sm" variant="outline">
                  <CreditCard className="h-4 w-4 mr-1" />
                  Cobrar sesión
                </Button>
              </div>

              {/* Payment Link */}
              <div className="flex items-center gap-2 text-sm">
                <LinkIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Link de pago:</span>
                <Button variant="link" size="sm" className="h-auto p-0 text-primary">
                  Generar link
                </Button>
              </div>
            </div>

            <Separator />

            {/* Communications Section */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">Comunicaciones</h4>

              {/* Notification Preferences */}
              <div className="space-y-3">
                <p className="text-sm font-medium">Notificaciones</p>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={session.send_reminder_whatsapp || false} />
                    <MessageSquare className="h-4 w-4 text-green-600" />
                    WhatsApp
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={session.send_reminder_sms || false} />
                    <Phone className="h-4 w-4" />
                    SMS
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={session.send_reminder_email || false} />
                    <Mail className="h-4 w-4" />
                    Email
                  </label>
                </div>
              </div>

              {/* Reminder Links */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Recordatorios</p>
                <div className="flex gap-2">
                  <Button variant="link" size="sm" className="h-auto p-0 text-xs">
                    Enviar WhatsApp manual
                  </Button>
                  <Button variant="link" size="sm" className="h-auto p-0 text-xs">
                    Enviar SMS manual
                  </Button>
                  <Button variant="link" size="sm" className="h-auto p-0 text-xs">
                    Enviar Email manual
                  </Button>
                </div>
              </div>
            </div>

            <Separator />

            {/* Private Notes */}
            <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                  <span className="font-medium text-sm">Apuntes privados de la sesión</span>
                  <ChevronDown className={cn('h-4 w-4 transition-transform', notesOpen && 'rotate-180')} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                {editingNotes ? (
                  <div className="space-y-2">
                    <Textarea
                      value={notesValue}
                      onChange={(e) => setNotesValue(e.target.value)}
                      placeholder="Añade notas privadas sobre esta sesión..."
                      rows={4}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleNotesSave}>
                        Guardar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingNotes(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="p-3 rounded-lg border bg-muted/30 min-h-[60px] cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setNotesValue(session.notes || '');
                      setEditingNotes(true);
                    }}
                  >
                    {session.notes ? (
                      <p className="text-sm">{session.notes}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Haz clic para añadir notas...</p>
                    )}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Status Change */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Cambiar estado</p>
              <Select
                value={session.status || 'scheduled'}
                onValueChange={handleStatusChange}
                disabled={isUpdating}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="scheduled">Programada</SelectItem>
                  <SelectItem value="confirmed">Confirmada</SelectItem>
                  <SelectItem value="completed">Completada</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                  <SelectItem value="no_show">No asistió</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Quick Actions */}
            {quickActions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {quickActions.map(({ status, label, icon: Icon }) => (
                  <Button
                    key={status}
                    variant="outline"
                    size="sm"
                    onClick={() => handleStatusChange(status)}
                    disabled={isUpdating}
                  >
                    {isUpdating ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Icon className="mr-1 h-4 w-4" />
                    )}
                    {label}
                  </Button>
                ))}
              </div>
            )}

            {/* External Links */}
            <div className="flex gap-4 pt-4">
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => {
                  if (session.patient) {
                    navigate(`/pacientes/${session.patient.id}`);
                    onOpenChange(false);
                  }
                }}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Historia clínica
              </Button>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs">
                <FileText className="h-3 w-3 mr-1" />
                Justificante de asistencia
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="historial" className="mt-0 px-6 py-4">
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay cambios registrados</p>
            </div>
          </TabsContent>

          <TabsContent value="sms" className="mt-0 px-6 py-4">
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay SMS enviados</p>
            </div>
          </TabsContent>

          <TabsContent value="otras" className="mt-0 px-6 py-4">
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay otras sesiones</p>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
