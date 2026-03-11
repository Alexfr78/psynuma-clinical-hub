import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, LogOut, CalendarPlus, Calendar, History, User, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePatientPortal } from '@/hooks/usePatientPortal';
import { PortalAppointments } from '@/components/portal/PortalAppointments';
import { PortalBooking } from '@/components/portal/PortalBooking';
import { PortalInvoices } from '@/components/portal/PortalInvoices';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RescheduleTarget {
  sessionId: string;
  sessionType: string;
  sessionModality: string;
  locationId: string | null;
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
    confirmSession,
    rescheduleSession,
    getMonthAvailability,
    createSession,
    getAvailability,
  } = usePatientPortal(slug);

  const [activeTab, setActiveTab] = useState('appointments');
  const [verifying, setVerifying] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<RescheduleTarget | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesFetched, setInvoicesFetched] = useState(false);

  const fetchInvoices = useCallback(async () => {
    const currentToken = localStorage.getItem(`portal_session_${slug}`);
    if (!currentToken) return;
    setInvoicesLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('patient-portal-invoices', {
        body: { action: 'list', sessionToken: currentToken },
      });
      if (!error && data?.invoices) {
        setInvoices(data.invoices);
      }
    } catch (e) {
      console.error('Error fetching invoices:', e);
    } finally {
      setInvoicesLoading(false);
      setInvoicesFetched(true);
    }
  }, [slug]);

  // Verify magic link token on mount
  useEffect(() => {
    if (token && !isAuthenticated && !verifying) {
      setVerifying(true);
      verifyMagicLink(token).then((result) => {
        setVerifying(false);
        if (!result.success) {
          toast.error(result.error || 'Enlace inválido o expirado');
          navigate(`/portal/${slug}`);
        } else {
          // Remove token from URL
          navigate(`/portal/${slug}/dashboard`, { replace: true });
        }
      });
    }
  }, [token, isAuthenticated, verifying]);

  // Fetch sessions when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchSessions();
    }
  }, [isAuthenticated, fetchSessions]);

  // Redirect if not authenticated and no token
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !token && !verifying) {
      navigate(`/portal/${slug}`);
    }
  }, [isLoading, isAuthenticated, token, verifying, slug, navigate]);

  const handleLogout = () => {
    logout();
    navigate(`/portal/${slug}`);
  };

  const handleCancel = async (sessionId: string) => {
    const result = await cancelSession(sessionId);
    if (result.success) {
      toast.success('Cita cancelada');
    } else {
      toast.error(result.error || 'Error al cancelar');
    }
  };

  const handleConfirm = async (sessionId: string) => {
    const result = await confirmSession(sessionId);
    if (result.success) {
      toast.success('Cita confirmada');
    } else {
      toast.error(result.error || 'Error al confirmar');
    }
  };

  const handleReschedule = (session: { id: string; session_type: string; session_modality: string; location: { id: string } | null }) => {
    setRescheduleTarget({
      sessionId: session.id,
      sessionType: session.session_type,
      sessionModality: session.session_modality,
      locationId: session.location?.id || null,
    });
    setActiveTab('booking');
  };

  const handleBookingComplete = () => {
    setActiveTab('appointments');
    setRescheduleTarget(null);
    fetchSessions();
  };

  const handleTabChange = (tab: string) => {
    if (tab !== 'booking') {
      setRescheduleTarget(null);
    }
    setActiveTab(tab);
  };

  if (isLoading || verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">
            {verifying ? 'Verificando acceso...' : 'Cargando...'}
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">
                {patient?.firstName} {patient?.lastName}
              </p>
              <p className="text-xs text-muted-foreground">{center?.name}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Salir</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Quick Action */}
        <Card>
          <CardContent className="pt-6">
            <Button 
              className="w-full" 
              size="lg"
              onClick={() => { setRescheduleTarget(null); setActiveTab('booking'); }}
            >
              <CalendarPlus className="h-5 w-5 mr-2" />
              Solicitar nueva cita
            </Button>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="appointments" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Próximas</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Historial</span>
            </TabsTrigger>
            <TabsTrigger value="invoices" className="flex items-center gap-2" onClick={() => { if (!invoicesFetched) fetchInvoices(); }}>
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Facturas</span>
            </TabsTrigger>
            <TabsTrigger value="booking" className="flex items-center gap-2">
              <CalendarPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Nueva cita</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="appointments" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Próximas citas</CardTitle>
                <CardDescription>
                  Tus citas programadas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PortalAppointments
                  sessions={sessions.upcoming}
                  loading={sessionsLoading}
                  onCancel={handleCancel}
                  onConfirm={handleConfirm}
                  onReschedule={handleReschedule}
                  emptyMessage="No tienes citas próximas"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Historial</CardTitle>
                <CardDescription>
                  Tus citas anteriores
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PortalAppointments
                  sessions={sessions.past}
                  loading={sessionsLoading}
                  isPast
                  emptyMessage="No tienes citas anteriores"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Facturas</CardTitle>
                <CardDescription>
                  Tus facturas emitidas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PortalInvoices
                  invoices={invoices}
                  loading={invoicesLoading}
                  sessionToken={localStorage.getItem(`portal_session_${slug}`)}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="booking" className="mt-4">
            <PortalBooking
              centerSlug={slug!}
              onComplete={handleBookingComplete}
              createSession={createSession}
              getAvailability={getAvailability}
              getMonthAvailability={getMonthAvailability}
              rescheduleSession={rescheduleSession}
              rescheduleTarget={rescheduleTarget}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
