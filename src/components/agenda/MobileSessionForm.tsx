import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  User, Globe, Plus, Video, MapPin, Ban, Settings2,
  Package, CreditCard, AlertCircle, X, CalendarIcon,
} from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { SessionNotificationSettings } from './SessionNotificationSettings';
import { RecurrenceSettings } from './RecurrenceSettings';
import { MobilePatientSearch } from './MobilePatientSearch';
import { RecurrenceConfig } from '@/types/recurring';

/* ────────── shared constants (same as in QuickCreateSessionDialog) ────────── */

const CANCELLATION_OPTIONS = [
  { value: 'not_allowed', label: 'No permitir cancelaciones' },
  { value: 'until_start', label: 'Hasta la hora de la sesión' },
  { value: 'until_1_hour', label: 'Hasta 1 hora antes' },
  { value: 'until_2_hours', label: 'Hasta 2 horas antes' },
  { value: '24_hours', label: 'Hasta 24 horas antes' },
  { value: '48_hours', label: 'Hasta 48 horas antes' },
  { value: '72_hours', label: 'Hasta 72 horas antes' },
];

const MODALITY_OPTIONS = [
  { value: 'in_person', label: 'Presencial', icon: MapPin },
  { value: 'google_meet', label: 'Google Meet', icon: Video },
  { value: 'zoom', label: 'Zoom', icon: Video },
  { value: 'custom_link', label: 'Link personalizado', icon: Video },
];

const PAYMENT_MODE_OPTIONS = [
  { value: '__default__', label: 'Predeterminado del centro', icon: Settings2 },
  { value: 'required_now', label: 'Pago obligatorio', icon: CreditCard },
  { value: 'in_session', label: 'Pago en sesión', icon: MapPin },
  { value: 'post_session', label: 'Pago post-sesión', icon: CalendarIcon },
  { value: 'scheduled_before', label: 'Programado antes', icon: Globe },
];

/* ────────── types ────────── */

interface MobileSessionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<any>;
  // Data
  patients: any[] | undefined;
  professionals: any[] | undefined;
  sessionTypes: any[] | undefined;
  locations: any[] | undefined;
  patientBonos: any[] | undefined;
  center: any;
  integrations: any;
  oauthConnections: any[] | undefined;
  // State
  recurrenceEnabled: boolean;
  recurrenceConfig: RecurrenceConfig;
  onRecurrenceEnabledChange: (v: boolean) => void;
  onRecurrenceConfigChange: (v: RecurrenceConfig) => void;
  userOverrodeLocation: boolean;
  onUserOverrodeLocation: () => void;
  // Submit
  onSubmit: (values: any, asDraft: boolean) => Promise<void>;
  isSubmitting: boolean;
  isCheckingConflicts: boolean;
  // Dialogs
  onShowQuickPatient: (searchTerm: string) => void;
  onShowLocationsDialog: () => void;
  onShowCreateBonoDialog: () => void;
}

export function MobileSessionForm({
  open,
  onOpenChange,
  form,
  patients,
  professionals,
  sessionTypes,
  locations,
  patientBonos,
  center,
  integrations,
  oauthConnections,
  recurrenceEnabled,
  recurrenceConfig,
  onRecurrenceEnabledChange,
  onRecurrenceConfigChange,
  userOverrodeLocation,
  onUserOverrodeLocation,
  onSubmit,
  isSubmitting,
  isCheckingConflicts,
  onShowQuickPatient,
  onShowLocationsDialog,
  onShowCreateBonoDialog,
}: MobileSessionFormProps) {
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [calendarExpanded, setCalendarExpanded] = useState(false);

  const sessionModality = form.watch('session_modality');
  const watchPatientId = form.watch('patient_id');
  const watchBonoId = form.watch('bono_id');
  const selectedPatient = patients?.find((p: any) => p.id === watchPatientId);
  const selectedProfessional = professionals?.find((p: any) => p.id === form.watch('professional_id'));
  const selectedType = sessionTypes?.find((t: any) => t.id === form.watch('session_type'));

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="h-[100dvh] flex flex-col p-0 rounded-none [&>button]:hidden"
        >
          {/* ─── Fixed Header ─── */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-background shrink-0"
               style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}
          >
            <h2 className="text-lg font-semibold">Nueva reserva</h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* ─── Scrollable Body ─── */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <Form {...form}>
              <form className="space-y-5 px-4 pt-4 pb-4">

                {/* ── Patient ── */}
                <FormField
                  control={form.control}
                  name="patient_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Contacto</FormLabel>
                      <FormControl>
                        <button
                          type="button"
                          className={cn(
                            'w-full flex items-center gap-3 rounded-md border border-input bg-background px-3 py-3 text-left min-h-[48px]',
                            !field.value && 'text-muted-foreground'
                          )}
                          onClick={() => setPatientSearchOpen(true)}
                        >
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <span className="flex-1 truncate text-base">
                            {selectedPatient
                              ? `${selectedPatient.first_name} ${selectedPatient.last_name}`
                              : 'Buscar contacto...'}
                          </span>
                        </button>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* ── Bono ── */}
                {watchPatientId && (
                  <FormField
                    control={form.control}
                    name="bono_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Bono
                        </FormLabel>
                        <div className="flex gap-2">
                          <Select onValueChange={field.onChange} value={field.value || 'none'}>
                            <SelectTrigger className="h-12 flex-1 text-base">
                              <SelectValue placeholder="Sin bono" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sin bono</SelectItem>
                              {patientBonos?.map((bono: any) => (
                                <SelectItem key={bono.id} value={bono.id}>
                                  <span className="flex items-center gap-2">
                                    {bono.name}
                                    <Badge variant="secondary" className="ml-1">
                                      {(bono.total_sessions || 0) - (bono.used_sessions || 0)} rest.
                                    </Badge>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-12 w-12"
                            onClick={onShowCreateBonoDialog}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        {field.value && field.value !== 'none' && (
                          <p className="text-xs text-muted-foreground">
                            El precio se establecerá a 0€ al usar el bono
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* ── Professional ── */}
                <FormField
                  control={form.control}
                  name="professional_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Profesional</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue>
                            {selectedProfessional ? (
                              <span className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <User className="h-3 w-3 text-primary" />
                                </div>
                                <span className="truncate">
                                  {selectedProfessional.first_name} {selectedProfessional.last_name}
                                </span>
                              </span>
                            ) : 'Seleccionar profesional'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {professionals?.map((prof: any) => (
                            <SelectItem key={prof.id} value={prof.id}>
                              {prof.first_name} {prof.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* ── Session Type ── */}
                <FormField
                  control={form.control}
                  name="session_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Tipo de sesión</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue>
                            {selectedType ? (
                              <span className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: selectedType.color }} />
                                {selectedType.name}
                                <span className="text-muted-foreground text-xs ml-1">
                                  ({selectedType.duration_minutes} min)
                                </span>
                              </span>
                            ) : 'Seleccionar tipo'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {sessionTypes?.map((type: any) => (
                            <SelectItem key={type.id} value={type.id}>
                              <span className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: type.color }} />
                                {type.name} ({type.duration_minutes} min)
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* ── Date (inline calendar) ── */}
                <FormField
                  control={form.control}
                  name="session_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Fecha</FormLabel>
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 rounded-md border border-input bg-background px-3 py-3 text-left min-h-[48px] text-base"
                        onClick={() => setCalendarExpanded(!calendarExpanded)}
                      >
                        <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="capitalize">
                          {field.value
                            ? format(field.value, "EEEE d 'de' MMMM yyyy", { locale: es })
                            : 'Seleccionar fecha'}
                        </span>
                      </button>
                      {calendarExpanded && (
                        <div className="border rounded-md mt-1 bg-background flex justify-center">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={(date) => {
                              if (date) {
                                field.onChange(date);
                                setCalendarExpanded(false);
                              }
                            }}
                            locale={es}
                          />
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* ── Time (native inputs) ── */}
                <div className="space-y-2">
                  <FormLabel className="text-sm font-medium">Hora</FormLabel>
                  <div className="flex items-center gap-3">
                    <FormField
                      control={form.control}
                      name="start_time"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input
                              type="time"
                              value={field.value}
                              onChange={(e) => field.onChange(e.target.value)}
                              className="h-12 text-base text-center"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <span className="text-muted-foreground font-medium shrink-0">—</span>
                    <FormField
                      control={form.control}
                      name="end_time"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input
                              type="time"
                              value={field.value}
                              onChange={(e) => field.onChange(e.target.value)}
                              className="h-12 text-base text-center"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* ── Cancellation Policy ── */}
                <FormField
                  control={form.control}
                  name="cancellation_policy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium flex items-center gap-2">
                        <Ban className="h-4 w-4" />
                        Cancelación
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CANCELLATION_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* ── Session Modality ── */}
                <FormField
                  control={form.control}
                  name="session_modality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium flex items-center gap-2">
                        <Video className="h-4 w-4" />
                        Modalidad
                      </FormLabel>
                      <Select
                        onValueChange={(v) => { field.onChange(v); onUserOverrodeLocation(); }}
                        value={field.value}
                      >
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MODALITY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <span className="flex items-center gap-2">
                                <opt.icon className="h-4 w-4" />
                                {opt.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {field.value === 'google_meet' && (!integrations?.google_meet_enabled || !oauthConnections?.some((c: any) => c.provider === 'google' && c.expires_at)) && (
                        <Alert variant="destructive" className="mt-2 py-2">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            Google Meet no está conectado.{' '}
                            <Link to="/configuracion" className="underline font-medium">Configúralo aquí</Link>
                          </AlertDescription>
                        </Alert>
                      )}
                      {field.value === 'zoom' && (!integrations?.zoom_enabled || !oauthConnections?.some((c: any) => c.provider === 'zoom' && c.expires_at)) && (
                        <Alert variant="destructive" className="mt-2 py-2">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            Zoom no está conectado.{' '}
                            <Link to="/configuracion" className="underline font-medium">Configúralo aquí</Link>
                          </AlertDescription>
                        </Alert>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Custom video link */}
                {sessionModality === 'custom_link' && (
                  <FormField
                    control={form.control}
                    name="video_call_link"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Link de videollamada</FormLabel>
                        <FormControl>
                          <Input placeholder="https://..." {...field} className="h-12 text-base" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Location (in_person only) */}
                {sessionModality === 'in_person' && (
                  <FormField
                    control={form.control}
                    name="location_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          Dirección
                        </FormLabel>
                        <div className="flex gap-2">
                          <Select
                            onValueChange={(v) => { field.onChange(v === '__none__' ? '' : v); onUserOverrodeLocation(); }}
                            value={field.value || '__none__'}
                          >
                            <SelectTrigger className="h-12 flex-1 text-base">
                              <SelectValue placeholder="Sin especificar" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Sin especificar</SelectItem>
                              {locations?.map((loc: any) => (
                                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-12 w-12"
                            onClick={onShowLocationsDialog}
                          >
                            <Settings2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Payment Mode */}
                <FormField
                  control={form.control}
                  name="payment_mode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Modo de pago
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_MODE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <span className="flex items-center gap-2">
                                <opt.icon className="h-4 w-4" />
                                {opt.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {field.value === '__default__' && center?.default_payment_mode && (
                        <p className="text-xs text-muted-foreground">
                          Actual: {PAYMENT_MODE_OPTIONS.find(o => o.value === center.default_payment_mode)?.label || center.default_payment_mode}
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Notification Settings */}
                <SessionNotificationSettings
                  compact
                  notifyWhatsapp={form.watch('notify_whatsapp')}
                  notifyEmail={form.watch('notify_email')}
                  notifySms={form.watch('notify_sms')}
                  onNotifyWhatsappChange={(c) => form.setValue('notify_whatsapp', c)}
                  onNotifyEmailChange={(c) => form.setValue('notify_email', c)}
                  onNotifySmsChange={(c) => form.setValue('notify_sms', c)}
                  reminderWhatsapp={form.watch('send_reminder_whatsapp')}
                  reminderEmail={form.watch('send_reminder_email')}
                  reminderSms={form.watch('send_reminder_sms')}
                  onReminderWhatsappChange={(c) => form.setValue('send_reminder_whatsapp', c)}
                  onReminderEmailChange={(c) => form.setValue('send_reminder_email', c)}
                  onReminderSmsChange={(c) => form.setValue('send_reminder_sms', c)}
                />

                {/* Recurrence */}
                <RecurrenceSettings
                  enabled={recurrenceEnabled}
                  onEnabledChange={onRecurrenceEnabledChange}
                  config={recurrenceConfig}
                  onConfigChange={onRecurrenceConfigChange}
                  startDate={form.watch('session_date')}
                  startTime={form.watch('start_time')}
                />

                {/* Timezone */}
                {!recurrenceEnabled && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Globe className="h-3 w-3" />
                    <span>Europe/Madrid</span>
                  </div>
                )}

                {/* Spacer to avoid content hidden behind sticky footer */}
                <div className="h-24" />
              </form>
            </Form>
          </div>

          {/* ─── Sticky Footer ─── */}
          <div
            className="shrink-0 border-t bg-background/95 backdrop-blur-sm px-4 py-3 flex gap-2"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
          >
            {!recurrenceEnabled && (
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-12 text-base"
                onClick={() => form.handleSubmit((v: any) => onSubmit(v, true))()}
                disabled={isSubmitting || isCheckingConflicts}
              >
                Borrador
              </Button>
            )}
            <Button
              type="button"
              className={cn("h-12 text-base", recurrenceEnabled ? "flex-1" : "flex-1")}
              onClick={() => form.handleSubmit((v: any) => onSubmit(v, false))()}
              disabled={isSubmitting || isCheckingConflicts}
            >
              {isCheckingConflicts
                ? 'Verificando...'
                : isSubmitting
                  ? 'Creando...'
                  : recurrenceEnabled
                    ? 'Crear serie'
                    : 'Crear sesión'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Patient search full-screen sheet */}
      <MobilePatientSearch
        open={patientSearchOpen}
        onOpenChange={setPatientSearchOpen}
        onSelect={(id) => {
          form.setValue('patient_id', id);
        }}
        onCreateNew={(term) => {
          onShowQuickPatient(term);
        }}
      />
    </>
  );
}
