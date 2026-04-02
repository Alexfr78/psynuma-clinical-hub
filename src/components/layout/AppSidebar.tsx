import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  Users,
  UserCog, FileText, FileSignature, ClipboardCheck, NotebookPen,
  FileText,
  FileSignature,
  ClipboardCheck,
  NotebookPen,
  Package,
  Receipt,
  CreditCard,
  Bell,
  Settings,
  ClipboardList,
  LogOut,
  Moon,
  Sun,
  Brain,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect } from 'react';
import { MyProfileDialog } from '@/components/layout/MyProfileDialog';


const mainNavItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Agenda', url: '/agenda', icon: Calendar },
  { title: 'Contactos', url: '/pacientes', icon: Users },
  { title: 'Sesiones', url: '/sesiones', icon: FileText },
  { title: 'Consents.', url: '/consentimientos', icon: FileSignature },
  { title: 'Evaluaciones', url: '/evaluaciones', icon: ClipboardCheck },
  { title: 'Autorregistros', url: '/autorregistros', icon: NotebookPen },
];

const financeNavItems = [
  { title: 'Bonos', url: '/bonos', icon: Package },
  { title: 'Facturas', url: '/facturas', icon: Receipt },
  { title: 'Cobros / Deudas', url: '/cobros', icon: CreditCard },
  { title: 'Notificaciones', url: '/notificaciones', icon: Bell },
];

// Items visible to admins only
const adminOnlyNavItems = [
  { title: 'Solicitudes', url: '/solicitudes', icon: ClipboardList },
  { title: 'Profesionales', url: '/profesionales', icon: UserCog },
  { title: 'Derivaciones', url: '/derivaciones', icon: Users },
  { title: 'Auditoría', url: '/auditoria', icon: FileText },
];

// Items visible to all users
const settingsNavItem = { title: 'Configuración', url: '/configuracion', icon: Settings };

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile, isAdmin } = useAuth();
  const { setOpenMobile, isMobile } = useSidebar();
  const [isDark, setIsDark] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark');
    setIsDark(isDarkMode);
  }, []);

  const toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
    setIsDark(!isDark);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const isActive = (url: string) => location.pathname === url;

  const handleNavigation = (url: string) => {
    navigate(url);
    // Always close sidebar on navigation - on desktop this has no effect
    setOpenMobile(false);
  };

  const NavItem = ({ item }: { item: typeof mainNavItems[0] }) => (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive(item.url)}
        className="cursor-pointer transition-colors"
      >
        <a
          onClick={(e) => {
            e.preventDefault();
            handleNavigation(item.url);
            // Close mobile sidebar after navigation
            if (isMobile) {
              setOpenMobile(false);
            }
          }}
          className="flex items-center gap-3"
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.title}</span>
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <>
    <Sidebar className="border-r-0">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary">
            <Brain className="h-6 w-6 text-sidebar-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="font-display text-lg font-bold text-sidebar-foreground">
              Psycma
            </span>
            <span className="text-xs text-sidebar-foreground/60">
              Gestión Clínica
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator className="bg-sidebar-border" />

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
            Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <NavItem key={item.url} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
            Finanzas
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {financeNavItems.map((item) => (
                <NavItem key={item.url} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Configuración visible to all users */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
            Ajustes
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavItem item={settingsNavItem} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin-only section */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
              Administración
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminOnlyNavItems.map((item) => (
                  <NavItem key={item.url} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="flex flex-col gap-2">
          {profile && (
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="flex w-full items-center gap-3 rounded-lg bg-sidebar-accent p-3 text-left transition-colors hover:bg-sidebar-accent/80 cursor-pointer"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-primary text-sm font-medium text-sidebar-primary-foreground">
                {profile.first_name?.[0] || profile.email[0].toUpperCase()}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="truncate text-sm font-medium text-sidebar-foreground">
                  {profile.first_name
                    ? `${profile.first_name} ${profile.last_name || ''}`
                    : profile.email}
                </span>
                <span className="truncate text-xs text-sidebar-foreground/60">
                  {profile.specialty || 'Profesional'}
                </span>
              </div>
            </button>
          )}

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="flex-1 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              className="flex-1 text-sidebar-foreground hover:bg-destructive hover:text-destructive-foreground"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>

    <MyProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}
