import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { CenterSetupWizard } from '@/components/setup/CenterSetupWizard';

interface AppLayoutProps {
  children: ReactNode;
}

const routeTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/agenda': 'Agenda',
  '/pacientes': 'Contactos',
  '/sesiones': 'Sesiones',
  '/bonos': 'Bonos',
  '/facturas': 'Facturas',
  '/cobros': 'Cobros / Deudas',
  '/configuracion': 'Configuración',
  '/auditoria': 'Auditoría',
};

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const { profile, isLoading } = useAuth();
  const currentTitle = routeTitles[location.pathname] || 'Psycma';

  // Show setup wizard if user doesn't have a center
  const needsSetup = !isLoading && profile && !profile.center_id;

  if (needsSetup) {
    return (
      <div className="min-h-screen bg-background">
        <CenterSetupWizard />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <SidebarInset className="flex flex-col">
          <header className="flex h-12 sm:h-14 shrink-0 items-center gap-2 border-b bg-card px-3 sm:px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden lg:block">
                  <BreadcrumbLink href="/dashboard">Psycma</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden lg:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage className="text-sm sm:text-base">{currentTitle}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>
          <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-6">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
