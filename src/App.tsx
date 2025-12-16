import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import PatientDetail from "./pages/PatientDetail";
import Agenda from "./pages/Agenda";
import Sessions from "./pages/Sessions";
import Bonos from "./pages/Bonos";
import Invoices from "./pages/Invoices";
import Payments from "./pages/Payments";
import Notifications from "./pages/Notifications";
import Professionals from "./pages/Professionals";
import Settings from "./pages/Settings";
import Audit from "./pages/Audit";
import NotFound from "./pages/NotFound";
import SessionManagement from "./pages/SessionManagement";
import Install from "./pages/Install";
import Consents from "./pages/Consents";
import ConsentSignature from "./pages/ConsentSignature";
import PatientPortal from "./pages/PatientPortal";
import PatientPortalDashboard from "./pages/PatientPortalDashboard";
import InvoiceView from "./pages/InvoiceView";

const queryClient = new QueryClient();

// Placeholder pages for remaining phases
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
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/auth" element={<Auth />} />
            
            {/* Public Routes (No Auth Required) */}
            <Route path="/cita/:token" element={<SessionManagement />} />
            <Route path="/consentimiento/:token" element={<ConsentSignature />} />
            <Route path="/factura/:token" element={<InvoiceView />} />
            <Route path="/instalar" element={<Install />} />
            <Route path="/portal/:slug" element={<PatientPortal />} />
            <Route path="/portal/:slug/dashboard" element={<PatientPortalDashboard />} />
            
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
            <Route path="/consentimientos" element={
              <ProtectedRoute>
                <AppLayout><Consents /></AppLayout>
              </ProtectedRoute>
            } />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
