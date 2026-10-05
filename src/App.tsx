import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PublicLanding } from "@/components/PublicLanding";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { WebRecorderProvider } from "@/hooks/useWebRecorder";
import { WebRecorderWidget } from "@/components/web-recorder/WebRecorderWidget";
import { RouteBoundary } from "@/components/RouteErrorBoundary";
import { lazyPage } from "@/lib/lazy-page";

// Una página = un chunk. Las rutas públicas del paciente ya no descargan la app entera.
const Auth = lazyPage(() => import("./pages/Auth"));
const ResetPassword = lazyPage(() => import("./pages/ResetPassword"));
const CompleteSignup = lazyPage(() => import("./pages/CompleteSignup"));
const Dashboard = lazyPage(() => import("./pages/Dashboard"));
const Patients = lazyPage(() => import("./pages/Patients"));
const PatientDetail = lazyPage(() => import("./pages/PatientDetail"));
const Agenda = lazyPage(() => import("./pages/Agenda"));
const Sessions = lazyPage(() => import("./pages/Sessions"));
const Bonos = lazyPage(() => import("./pages/Bonos"));
const Invoices = lazyPage(() => import("./pages/Invoices"));
const Payments = lazyPage(() => import("./pages/Payments"));
const Expenses = lazyPage(() => import("./pages/Expenses"));
const Notifications = lazyPage(() => import("./pages/Notifications"));
const Professionals = lazyPage(() => import("./pages/Professionals"));
const Settings = lazyPage(() => import("./pages/Settings"));
const Audit = lazyPage(() => import("./pages/Audit"));
const AuditLog = lazyPage(() => import("./pages/AuditLog"));
const IntakeRequests = lazyPage(() => import("./pages/IntakeRequests"));
const NotFound = lazyPage(() => import("./pages/NotFound"));
const SessionManagement = lazyPage(() => import("./pages/SessionManagement"));
const CoupleCancellationResponse = lazyPage(() => import("./pages/CoupleCancellationResponse"));
const Install = lazyPage(() => import("./pages/Install"));
const Consents = lazyPage(() => import("./pages/Consents"));
const ConsentSignature = lazyPage(() => import("./pages/ConsentSignature"));
const PatientPortal = lazyPage(() => import("./pages/PatientPortal"));
const PatientPortalDashboard = lazyPage(() => import("./pages/PatientPortalDashboard"));
const InvoiceView = lazyPage(() => import("./pages/InvoiceView"));
const PatientReportView = lazyPage(() => import("./pages/PatientReportView"));
const PublicBooking = lazyPage(() => import("./pages/PublicBooking"));
const PublicBookingManage = lazyPage(() => import("./pages/PublicBookingManage"));
const Assessments = lazyPage(() => import("./pages/Assessments"));
const AssessmentPublic = lazyPage(() => import("./pages/AssessmentPublic"));
const EMOPublic = lazyPage(() => import("./pages/EMOPublic"));
const AssessmentResults = lazyPage(() => import("./pages/AssessmentResults"));
const PayDebt = lazyPage(() => import("./pages/PayDebt"));
const PaymentSuccess = lazyPage(() => import("./pages/PaymentSuccess"));
const PublicReferralRegister = lazyPage(() => import("./pages/PublicReferralRegister"));
const Referrals = lazyPage(() => import("./pages/Referrals"));
const Autoregistros = lazyPage(() => import("./pages/Autoregistros"));
const AutoregistroPublic = lazyPage(() => import("./pages/AutoregistroPublic"));
const PlaudReview = lazyPage(() => import("./pages/PlaudReview"));
const Recordings = lazyPage(() => import("./pages/Recordings"));
const PublicShortLinkRedirect = lazyPage(() => import("./pages/PublicShortLinkRedirect"));
const ShareAudio = lazyPage(() => import("./pages/ShareAudio"));

const queryClient = new QueryClient();

// Placeholder for future sections
const PlaceholderPage = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center py-12">
    <h1 className="font-display text-2xl font-bold">{title}</h1>
    <p className="mt-2 text-muted-foreground">Esta sección estará disponible próximamente</p>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <WebRecorderProvider>
          <RouteBoundary fullScreen>
          <Routes>
            <Route path="/" element={<PublicLanding />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/completar/:token" element={<CompleteSignup />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            
            {/* Public Routes (No Auth Required) */}
            <Route path="/cita/:token" element={<SessionManagement />} />
            <Route path="/pareja/cancelacion/:token" element={<CoupleCancellationResponse />} />
            <Route path="/consentimiento/:token" element={<ConsentSignature />} />
            <Route path="/evaluacion/:token" element={<AssessmentPublic />} />
            <Route path="/emo/:token" element={<EMOPublic />} />
            <Route path="/factura/:token" element={<InvoiceView />} />
            <Route path="/informe/:token" element={<PatientReportView />} />
            <Route path="/instalar" element={<Install />} />
            <Route path="/portal/:slug" element={<PatientPortal />} />
            <Route path="/portal/:slug/dashboard" element={<PatientPortalDashboard />} />
            <Route path="/book/:centerSlug" element={<PublicBooking />} />
            <Route path="/reservas/:centerSlug" element={<PublicBooking />} />
            <Route path="/book/:centerSlug/manage" element={<PublicBookingManage />} />
            <Route path="/reservas/:centerSlug/manage" element={<PublicBookingManage />} />
            <Route path="/pagar/:token" element={<PayDebt />} />
            <Route path="/pago-exitoso" element={<PaymentSuccess />} />
            <Route path="/derivaciones/:centerSlug/registro" element={<PublicReferralRegister />} />
            <Route path="/registro/:token" element={<AutoregistroPublic />} />
            <Route path="/enlace/:code" element={<PublicShortLinkRedirect />} />
            
            {/* Protected Routes */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <AppLayout><Dashboard /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/agenda" element={
              <ProtectedRoute>
                <AppLayout><Agenda /></AppLayout>
              </ProtectedRoute>
            } />

            {/* Destino del share target de Android (ver `share_target` en vite.config.ts) */}
            <Route path="/compartir-audio" element={
              <ProtectedRoute>
                <AppLayout><ShareAudio /></AppLayout>
              </ProtectedRoute>
            } />
            
            {/* Patient Routes */}
            <Route path="/pacientes" element={
              <ProtectedRoute>
                <AppLayout><Patients /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/pacientes/:id" element={
              <ProtectedRoute>
                <AppLayout><PatientDetail /></AppLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/sesiones" element={
              <ProtectedRoute>
                <AppLayout><Sessions /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/bonos" element={
              <ProtectedRoute>
                <AppLayout><Bonos /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/facturas" element={
              <ProtectedRoute>
                <AppLayout><Invoices /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/cobros" element={
              <ProtectedRoute>
                <AppLayout><Payments /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/gastos" element={
              <ProtectedRoute>
                <AppLayout><Expenses /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/notificaciones" element={
              <ProtectedRoute>
                <AppLayout><Notifications /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/profesionales" element={
              <ProtectedRoute requiredRoles={['admin']}>
                <AppLayout><Professionals /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/derivaciones" element={
              <ProtectedRoute requiredRoles={['admin']}>
                <AppLayout><Referrals /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/configuracion" element={
              <ProtectedRoute>
                <AppLayout><Settings /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/auditoria" element={
              <ProtectedRoute requiredRoles={['admin']}>
                <AppLayout><Audit /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/auditoria-clinica" element={
              <ProtectedRoute requiredRoles={['admin']}>
                <AppLayout><AuditLog /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/solicitudes" element={
              <ProtectedRoute requiredRoles={['admin']}>
                <AppLayout><IntakeRequests /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/consentimientos" element={
              <ProtectedRoute>
                <AppLayout><Consents /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/evaluaciones" element={
              <ProtectedRoute>
                <AppLayout><Assessments /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/evaluaciones/:assessmentId/resultados" element={
              <ProtectedRoute>
                <AppLayout><AssessmentResults /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/autorregistros" element={
              <ProtectedRoute>
                <AppLayout><Autoregistros /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/grabaciones" element={
              <ProtectedRoute>
                <AppLayout><Recordings /></AppLayout>
              </ProtectedRoute>
            } />
            {/* Bandeja de Plaud: integración abandonada, solo histórico (no está en el menú). */}
            <Route path="/grabaciones/plaud" element={
              <ProtectedRoute>
                <AppLayout><PlaudReview /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="*" element={<NotFound />} />
          </Routes>
          </RouteBoundary>
          <WebRecorderWidget />
          </WebRecorderProvider>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
