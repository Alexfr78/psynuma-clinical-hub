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
import NotFound from "./pages/NotFound";

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
            
            {/* Protected Routes */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <AppLayout><Dashboard /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/agenda" element={
              <ProtectedRoute>
                <AppLayout><PlaceholderPage title="Agenda" /></AppLayout>
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
                <AppLayout><PlaceholderPage title="Sesiones" /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/bonos" element={
              <ProtectedRoute>
                <AppLayout><PlaceholderPage title="Bonos" /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/facturas" element={
              <ProtectedRoute>
                <AppLayout><PlaceholderPage title="Facturas" /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/cobros" element={
              <ProtectedRoute>
                <AppLayout><PlaceholderPage title="Cobros / Deudas" /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/configuracion" element={
              <ProtectedRoute>
                <AppLayout><PlaceholderPage title="Configuración" /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/auditoria" element={
              <ProtectedRoute requiredRoles={['admin']}>
                <AppLayout><PlaceholderPage title="Auditoría" /></AppLayout>
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
