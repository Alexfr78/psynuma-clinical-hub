import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  CalendarPlus,
  CircleUserRound,
  FileText,
  Files,
  Loader2,
  ReceiptText,
  User,
  WalletCards,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { usePatientPortal } from '@/hooks/usePatientPortal';
import { PortalAppointments } from '@/components/portal/PortalAppointments';
import { PortalBooking } from '@/components/portal/PortalBooking';
import { PortalPaymentMethod } from '@/components/portal/PortalPaymentMethod';
import { PortalInvoices, type PortalInvoice } from '@/components/portal/PortalInvoices';
import { PortalFinanceOverview, type PortalFinanceData } from '@/components/portal/PortalFinanceOverview';
import { PortalDocuments, type PortalDocument } from '@/components/portal/PortalDocuments';
import { PortalAccount, type PortalAccountData } from '@/components/portal/PortalAccount';
import { PortalNavigation, type PortalMainSection } from '@/components/portal/PortalNavigation';
import { redirectTopLevel } from '@/lib/redirect';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RescheduleTarget {
  sessionId: string;
  sessionType: string;
  sessionModality: string;
  locationId: string | null;
}

type PortalSection = PortalMainSection | 'booking';

const validSections = new Set<PortalSection>(['home', 'appointments', 'documents', 'payments', 'account', 'booking']);

function parseSection(value: string | null): PortalSection {
  return value && validSections.has(value as PortalSection) ? value as PortalSection : 'home';
}

export default function PatientPortalDashboard() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const {
    isAuthenticated,
    isLoading,
    patient,
    center,
    sessions,
    sessionsLoading,
    verifyMagicLink,
    logout,
    fetchSessions,
    cancelSession,
    getCancellationPreview,
    confirmSession,
    rescheduleSession,
    getMonthAvailability,
    createSession,
    getBookingRequirements,
    createSetupIntent,
    getPaymentMethod,
    removePaymentMethod,
    getAvailability,
  } = usePatientPortal(slug);

  const [activeSection, setActiveSection] = useState<PortalSection>(() => parseSection(searchParams.get('section')));
  const [appointmentsView, setAppointmentsView] = useState<'upcoming' | 'history' | 'cancelled'>('upcoming');
  const [verifying, setVerifying] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<RescheduleTarget | null>(null);
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [finance, setFinance] = useState<PortalFinanceData>({ debts: [], bonos: [], payments: [] });
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesFetched, setInvoicesFetched] = useState(false);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsFetched, setDocumentsFetched] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [accountData, setAccountData] = useState<PortalAccountData | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountFetched, setAccountFetched] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const fetchAccount = useCallback(async () => {
    const currentToken = localStorage.getItem(`portal_session_${slug}`);
    if (!currentToken) return;
    setAccountLoading(true);
    setAccountError(null);
    try {
      const { data, error } = await supabase.functions.invoke('patient-portal-account', {
        body: { action: 'get', sessionToken: currentToken },
      });
      if (error || data?.error) throw error || new Error(data.error);
      setAccountData(data as PortalAccountData);
    } catch (error) {
      console.error('Error fetching portal account:', error);
      setAccountError('No se pudieron cargar los datos de tu cuenta. Comprueba la conexión e inténtalo de nuevo.');
    } finally {
      setAccountLoading(false);
      setAccountFetched(true);
    }
  }, [slug]);

  const fetchDocuments = useCallback(async () => {
    const currentToken = localStorage.getItem(`portal_session_${slug}`);
    if (!currentToken) return;
    setDocumentsLoading(true);
    setDocumentsError(null);
    try {
      const { data, error } = await supabase.functions.invoke('patient-portal-documents', {
        body: { action: 'list', sessionToken: currentToken },
      });
      if (error || data?.error) throw error || new Error(data.error);
      setDocuments(data?.documents || []);
    } catch (error) {
      console.error('Error fetching portal documents:', error);
      setDocumentsError('No se pudieron cargar tus documentos. Comprueba la conexión e inténtalo de nuevo.');
    } finally {
      setDocumentsLoading(false);
      setDocumentsFetched(true);
    }
  }, [slug]);

  const fetchInvoices = useCallback(async () => {
    const currentToken = localStorage.getItem(`portal_session_${slug}`);
    if (!currentToken) return;

    setInvoicesLoading(true);
    setInvoicesError(null);
    try {
      const [invoiceResult, financeResult] = await Promise.all([
        supabase.functions.invoke('patient-portal-invoices', {
          body: { action: 'list', sessionToken: currentToken },
        }),
        supabase.functions.invoke('patient-portal-invoices', {
          body: { action: 'finance-summary', sessionToken: currentToken },
        }),
      ]);
      if (invoiceResult.error || invoiceResult.data?.error) {
        throw invoiceResult.error || new Error(invoiceResult.data.error);
      }
      if (financeResult.error || financeResult.data?.error) {
        throw financeResult.error || new Error(financeResult.data.error);
      }
      setInvoices(invoiceResult.data?.invoices || []);
      setFinance({
        debts: financeResult.data?.debts || [],
        bonos: financeResult.data?.bonos || [],
        payments: financeResult.data?.payments || [],
      });
    } catch (error) {
      console.error('Error fetching invoices:', error);
      setInvoicesError('No se pudieron cargar tus facturas. Comprueba la conexión e inténtalo de nuevo.');
    } finally {
      setInvoicesLoading(false);
      setInvoicesFetched(true);
    }
  }, [slug]);

  const changeSection = useCallback((section: PortalSection) => {
    if (section !== 'booking') setRescheduleTarget(null);
    if (section === 'payments' && !invoicesFetched && !invoicesLoading) void fetchInvoices();
    if (section === 'documents' && !documentsFetched && !documentsLoading) void fetchDocuments();
    if (section === 'account' && !accountFetched && !accountLoading) void fetchAccount();
    setActiveSection(section);
    navigate(`/portal/${slug}/dashboard?section=${section}`, { replace: true });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [accountFetched, accountLoading, documentsFetched, documentsLoading, fetchAccount, fetchDocuments, fetchInvoices, invoicesFetched, invoicesLoading, navigate, slug]);

  useEffect(() => {
    if (!token) setActiveSection(parseSection(searchParams.get('section')));
  }, [searchParams, token]);

  useEffect(() => {
    if (token && !isAuthenticated && !verifying) {
      setVerifying(true);
      verifyMagicLink(token).then((result) => {
        setVerifying(false);
        if (!result.success) {
          toast.error(result.error || 'Enlace inválido o expirado');
          navigate(`/portal/${slug}`);
        } else {
          navigate(`/portal/${slug}/dashboard?section=home`, { replace: true });
        }
      });
    }
  }, [token, isAuthenticated, verifying, verifyMagicLink, navigate, slug]);

  useEffect(() => {
    if (isAuthenticated) {
      void fetchSessions();
      if (!invoicesFetched && !invoicesLoading) void fetchInvoices();
      if (!documentsFetched && !documentsLoading) void fetchDocuments();
      if (!accountFetched && !accountLoading) void fetchAccount();
    }
  }, [accountFetched, accountLoading, documentsFetched, documentsLoading, fetchAccount, fetchDocuments, isAuthenticated, fetchSessions, fetchInvoices, invoicesFetched, invoicesLoading]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !token && !verifying) navigate(`/portal/${slug}`);
  }, [isLoading, isAuthenticated, token, verifying, slug, navigate]);

  const handleLogout = () => {
    logout();
    navigate(`/portal/${slug}`);
  };

  const handleCancel = async (sessionId: string) => {
    const result = await cancelSession(sessionId);
    if (result.success) toast.success('Cita cancelada');
    else toast.error(result.error || 'Error al cancelar');
  };

  const handleConfirm = async (sessionId: string) => {
    const result = await confirmSession(sessionId);
    if (result.success) toast.success('Cita confirmada');
    else toast.error(result.error || 'Error al confirmar');
  };

  const handleReschedule = (session: {
    id: string;
    session_type: string;
    session_modality: string;
    location: { id: string } | null;
  }) => {
    setRescheduleTarget({
      sessionId: session.id,
      sessionType: session.session_type,
      sessionModality: session.session_modality,
      locationId: session.location?.id || null,
    });
    setActiveSection('booking');
    navigate(`/portal/${slug}/dashboard?section=booking`, { replace: true });
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const handleBookingComplete = () => {
    setAppointmentsView('upcoming');
    setRescheduleTarget(null);
    changeSection('appointments');
    void fetchSessions();
  };

  const handleSaveCard = async (sessionId: string) => {
    const setup = await createSetupIntent(sessionId);
    if (setup?.url) redirectTopLevel(setup.url);
    else toast.error('No se pudo abrir el guardado de la tarjeta. Inténtalo más tarde.');
  };

  if (isLoading || verifying) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="space-y-4 text-center" role="status" aria-live="polite">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-muted-foreground">{verifying ? 'Verificando acceso...' : 'Cargando tu portal...'}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const mainSection: PortalMainSection = activeSection === 'booking' ? 'appointments' : activeSection;
  const nextAppointment = sessions.upcoming[0];
  const pendingCardCount = sessions.upcoming.filter((session) => session.status === 'draft').length;
  const pendingInvoiceCount = invoices.filter((invoice) => invoice.status === 'issued').length;
  const pendingDocumentCount = documents.filter((document) => ['pending', 'in_progress'].includes(document.status)).length;
  const completedAppointments = sessions.past.filter((session) => session.status !== 'cancelled');
  const cancelledAppointments = sessions.past.filter((session) => session.status === 'cancelled');

  return (
    <div className="min-h-dvh bg-gradient-to-br from-background via-background to-muted/40">
      <a href="#portal-content" className="sr-only z-50 rounded-md bg-background px-4 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:ring-2 focus:ring-ring">
        Saltar al contenido
      </a>

      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{patient?.firstName} {patient?.lastName}</p>
              <p className="truncate text-xs text-muted-foreground">{center?.name}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="hidden min-h-11 sm:inline-flex" onClick={() => changeSection('account')}>
            <CircleUserRound className="mr-2 h-4 w-4" aria-hidden="true" />
            Mi cuenta
          </Button>
        </div>
      </header>

      <main id="portal-content" className="mx-auto max-w-5xl space-y-5 px-4 pb-28 pt-5 sm:px-6 md:pb-10">
        {activeSection !== 'booking' && <PortalNavigation activeSection={mainSection} onSelect={changeSection} />}

        {activeSection === 'home' && (
          <div className="space-y-5">
            <section aria-labelledby="portal-welcome" className="space-y-1">
              <h1 id="portal-welcome" className="text-2xl font-semibold tracking-tight sm:text-3xl">Hola, {patient?.firstName}</h1>
              <p className="text-sm leading-6 text-muted-foreground sm:text-base">Aquí tienes lo más importante de tu atención con {center?.name}.</p>
            </section>

            {(pendingCardCount > 0 || pendingInvoiceCount > 0 || pendingDocumentCount > 0) && (
              <Alert>
                <WalletCards className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Tienes acciones pendientes</AlertTitle>
                <AlertDescription className="mt-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    {pendingCardCount > 0 && `${pendingCardCount} reserva${pendingCardCount > 1 ? 's' : ''} pendiente${pendingCardCount > 1 ? 's' : ''} de tarjeta.`}
                    {pendingCardCount > 0 && pendingInvoiceCount > 0 ? ' ' : ''}
                    {pendingInvoiceCount > 0 && `${pendingInvoiceCount} factura${pendingInvoiceCount > 1 ? 's' : ''} emitida${pendingInvoiceCount > 1 ? 's' : ''}.`}
                    {(pendingCardCount > 0 || pendingInvoiceCount > 0) && pendingDocumentCount > 0 ? ' ' : ''}
                    {pendingDocumentCount > 0 && `${pendingDocumentCount} documento${pendingDocumentCount > 1 ? 's' : ''} pendiente${pendingDocumentCount > 1 ? 's' : ''}.`}
                  </span>
                  <Button variant="outline" size="sm" className="min-h-11 shrink-0" onClick={() => changeSection(pendingDocumentCount > 0 ? 'documents' : 'payments')}>Revisar pendientes</Button>
                </AlertDescription>
              </Alert>
            )}

            <Card className="overflow-hidden shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between gap-4 bg-muted/30">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
                    Tu próxima cita
                  </CardTitle>
                  <CardDescription>Los datos y acciones de tu siguiente sesión</CardDescription>
                </div>
                {nextAppointment && <Button variant="ghost" size="sm" className="hidden min-h-11 sm:inline-flex" onClick={() => changeSection('appointments')}>Ver todas</Button>}
              </CardHeader>
              <CardContent className="pt-5">
                <PortalAppointments
                  sessions={nextAppointment ? [nextAppointment] : []}
                  loading={sessionsLoading}
                  onCancel={handleCancel}
                  onCancellationPreview={getCancellationPreview}
                  onConfirm={handleConfirm}
                  onReschedule={handleReschedule}
                  onSaveCard={handleSaveCard}
                  emptyMessage="No tienes citas próximas"
                />
                {!sessionsLoading && !nextAppointment && (
                  <Button className="mt-4 min-h-11 w-full sm:w-auto" onClick={() => changeSection('booking')}>
                    <CalendarPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Solicitar una cita
                  </Button>
                )}
              </CardContent>
            </Card>

            <section aria-labelledby="quick-actions" className="space-y-3">
              <h2 id="quick-actions" className="text-lg font-semibold">Acciones rápidas</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Button className="min-h-14 justify-start" onClick={() => changeSection('booking')}>
                  <CalendarPlus className="mr-3 h-5 w-5" aria-hidden="true" />Solicitar nueva cita
                </Button>
                <Button variant="outline" className="min-h-14 justify-start" onClick={() => changeSection('appointments')}>
                  <CalendarDays className="mr-3 h-5 w-5" aria-hidden="true" />Ver todas mis citas
                </Button>
                <Button variant="outline" className="min-h-14 justify-start" onClick={() => changeSection('payments')}>
                  <ReceiptText className="mr-3 h-5 w-5" aria-hidden="true" />Consultar facturas
                </Button>
                <Button variant="outline" className="min-h-14 justify-start" onClick={() => changeSection('documents')}>
                  <Files className="mr-3 h-5 w-5" aria-hidden="true" />Ver documentos
                </Button>
              </div>
            </section>
          </div>
        )}

        {activeSection === 'appointments' && (
          <section aria-labelledby="appointments-title" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 id="appointments-title" className="text-2xl font-semibold tracking-tight">Mis citas</h1>
                <p className="mt-1 text-sm text-muted-foreground">Consulta y gestiona tus sesiones.</p>
              </div>
              <Button className="min-h-11" onClick={() => changeSection('booking')}>
                <CalendarPlus className="mr-2 h-4 w-4" aria-hidden="true" />Solicitar cita
              </Button>
            </div>

            <Tabs value={appointmentsView} onValueChange={(value) => setAppointmentsView(value as 'upcoming' | 'history' | 'cancelled')}>
              <TabsList className="grid h-auto min-h-12 w-full grid-cols-3">
                <TabsTrigger value="upcoming" className="min-h-11">Próximas ({sessions.upcoming.length})</TabsTrigger>
                <TabsTrigger value="history" className="min-h-11">Anteriores ({completedAppointments.length})</TabsTrigger>
                <TabsTrigger value="cancelled" className="min-h-11">Canceladas ({cancelledAppointments.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="upcoming" className="mt-4">
                <Card>
                  <CardHeader><CardTitle className="text-lg">Próximas citas</CardTitle><CardDescription>Tus sesiones programadas y pendientes</CardDescription></CardHeader>
                  <CardContent>
                    <PortalAppointments sessions={sessions.upcoming} loading={sessionsLoading} onCancel={handleCancel} onCancellationPreview={getCancellationPreview} onConfirm={handleConfirm} onReschedule={handleReschedule} onSaveCard={handleSaveCard} emptyMessage="No tienes citas próximas" />
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="history" className="mt-4">
                <Card>
                  <CardHeader><CardTitle className="text-lg">Historial</CardTitle><CardDescription>Sesiones anteriores y citas canceladas</CardDescription></CardHeader>
                  <CardContent><PortalAppointments sessions={completedAppointments} loading={sessionsLoading} isPast emptyMessage="No tienes citas anteriores" /></CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="cancelled" className="mt-4">
                <Card>
                  <CardHeader><CardTitle className="text-lg">Citas canceladas</CardTitle><CardDescription>Reservas que fueron canceladas</CardDescription></CardHeader>
                  <CardContent><PortalAppointments sessions={cancelledAppointments} loading={sessionsLoading} isPast isCancelled emptyMessage="No tienes citas canceladas" /></CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </section>
        )}

        {activeSection === 'payments' && (
          <section aria-labelledby="payments-title" className="space-y-4">
            <div><h1 id="payments-title" className="text-2xl font-semibold tracking-tight">Pagos y facturas</h1><p className="mt-1 text-sm text-muted-foreground">Consulta tus facturas y el método de pago guardado.</p></div>
            <PortalFinanceOverview data={finance} loading={invoicesLoading} />
            <PortalPaymentMethod getPaymentMethod={getPaymentMethod} removePaymentMethod={removePaymentMethod} />
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-5 w-5 text-primary" aria-hidden="true" />Facturas</CardTitle><CardDescription>Tus facturas emitidas</CardDescription></CardHeader>
              <CardContent>
                {invoicesError ? (
                  <Alert variant="destructive">
                    <AlertTitle>No se pudieron cargar las facturas</AlertTitle>
                    <AlertDescription className="mt-2 space-y-3"><p>{invoicesError}</p><Button variant="outline" size="sm" className="min-h-11" onClick={() => void fetchInvoices()}>Reintentar</Button></AlertDescription>
                  </Alert>
                ) : (
                  <PortalInvoices invoices={invoices} loading={invoicesLoading} sessionToken={localStorage.getItem(`portal_session_${slug}`)} />
                )}
              </CardContent>
            </Card>
          </section>
        )}

        {activeSection === 'documents' && (
          <section aria-labelledby="documents-title" className="space-y-4">
            <div><h1 id="documents-title" className="text-2xl font-semibold tracking-tight">Documentos</h1><p className="mt-1 text-sm text-muted-foreground">Firma consentimientos y completa las tareas que te haya enviado tu profesional.</p></div>
            {documentsError ? (
              <Alert variant="destructive"><AlertTitle>No se pudieron cargar los documentos</AlertTitle><AlertDescription className="mt-2 space-y-3"><p>{documentsError}</p><Button variant="outline" size="sm" className="min-h-11" onClick={() => void fetchDocuments()}>Reintentar</Button></AlertDescription></Alert>
            ) : (
              <PortalDocuments documents={documents} loading={documentsLoading} />
            )}
          </section>
        )}

        {activeSection === 'account' && (
          <section aria-labelledby="account-title" className="space-y-4">
            <div><h1 id="account-title" className="text-2xl font-semibold tracking-tight">Mi cuenta</h1><p className="mt-1 text-sm text-muted-foreground">Datos personales, comunicaciones y ayuda administrativa.</p></div>
            {accountError ? (
              <Alert variant="destructive"><AlertTitle>No se pudo cargar tu cuenta</AlertTitle><AlertDescription className="mt-2 space-y-3"><p>{accountError}</p><Button variant="outline" size="sm" className="min-h-11" onClick={() => void fetchAccount()}>Reintentar</Button></AlertDescription></Alert>
            ) : (
              <PortalAccount data={accountData} loading={accountLoading} onLogout={handleLogout} />
            )}
          </section>
        )}

        {activeSection === 'booking' && (
          <section aria-labelledby="booking-title" className="space-y-4">
            <Button variant="ghost" className="min-h-11 px-2" onClick={() => changeSection(rescheduleTarget ? 'appointments' : 'home')}><ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />Volver</Button>
            <h1 id="booking-title" className="sr-only">{rescheduleTarget ? 'Reprogramar cita' : 'Solicitar nueva cita'}</h1>
            <PortalBooking centerSlug={slug!} onComplete={handleBookingComplete} createSession={createSession} getBookingRequirements={getBookingRequirements} createSetupIntent={createSetupIntent} getAvailability={getAvailability} getMonthAvailability={getMonthAvailability} rescheduleSession={rescheduleSession} rescheduleTarget={rescheduleTarget} getCancellationPreview={getCancellationPreview} />
          </section>
        )}
      </main>
    </div>
  );
}
