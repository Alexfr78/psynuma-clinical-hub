import { useLocation, useNavigate } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { useSidebar } from '@/components/ui/sidebar-context';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { usePlaudNeedsReviewCount } from '@/hooks/usePlaudRecordings';
import { useState, useEffect, useMemo } from 'react';
import { MyProfileDialog } from '@/components/layout/MyProfileDialog';
import { Icon } from '@/components/ui/icon';

// `badgeAriaText` es el texto completo para lectores de pantalla (p.ej. "3 grabaciones por
// revisar") — se define en el punto donde se sabe de qué trata el aviso, en vez de que el
// grupo colapsable (compartido por varias secciones) tenga que adivinar el sustantivo a partir
// del número.
type NavItemDef = { title: string; url: string; icon: string; badgeCount?: number; badgeAriaText?: string };

// Top-level, always visible
const mainNavItems: NavItemDef[] = [
  { title: 'Panel', url: '/dashboard', icon: 'dashboard' },
  { title: 'Agenda', url: '/agenda', icon: 'calendar_month' },
  { title: 'Contactos', url: '/pacientes', icon: 'group' },
];

const financeNavItems: NavItemDef[] = [
  { title: 'Bonos', url: '/bonos', icon: 'package_2' },
  { title: 'Facturas', url: '/facturas', icon: 'receipt_long' },
  { title: 'Cobros / Deudas', url: '/cobros', icon: 'credit_card' },
  { title: 'Gastos', url: '/gastos', icon: 'payments' },
];

// Secondary tools, tucked away in a collapsed "Más" group.
// "Grabaciones" lleva su `badgeCount` aparte porque depende de una consulta (ver
// `usePlaudNeedsReviewCount` más abajo) — la lista base se completa con él en el componente.
const baseMoreNavItems: NavItemDef[] = [
  { title: 'Sesiones', url: '/sesiones', icon: 'description' },
  { title: 'Consentimientos', url: '/consentimientos', icon: 'edit_document' },
  { title: 'Evaluaciones', url: '/evaluaciones', icon: 'assignment_turned_in' },
  { title: 'Autorregistros', url: '/autorregistros', icon: 'edit_note' },
  { title: 'Grabaciones', url: '/grabaciones', icon: 'graphic_eq' },
];

// Admin-only
const adminOnlyNavItems: NavItemDef[] = [
  { title: 'Solicitudes', url: '/solicitudes', icon: 'checklist' },
  { title: 'Mensajes', url: '/notificaciones', icon: 'notifications' },
  { title: 'Profesionales', url: '/profesionales', icon: 'manage_accounts' },
  { title: 'Derivaciones', url: '/derivaciones', icon: 'group' },
  { title: 'Auditoría', url: '/auditoria', icon: 'verified_user' },
  { title: 'Auditoría Clínica', url: '/auditoria-clinica', icon: 'verified_user' },
];

const settingsNavItem: NavItemDef = { title: 'Configuración', url: '/configuracion', icon: 'settings' };

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile, isAdmin } = useAuth();
  const { setOpenMobile, isMobile } = useSidebar();
  const [isDark, setIsDark] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Grabaciones Plaud pendientes de revisión humana (ver CLAUDE.md / usePlaudRecordings.tsx):
  // avisa en el menú para que esa bandeja no se quede sin atender. `data` es `undefined`
  // mientras carga y `0` en cuanto no hay nada pendiente — en ambos casos no se pinta nada.
  const { data: plaudNeedsReviewCount } = usePlaudNeedsReviewCount();

  const moreNavItems: NavItemDef[] = useMemo(
    () => baseMoreNavItems.map((item) =>
      item.url === '/grabaciones'
        ? {
          ...item,
          badgeCount: plaudNeedsReviewCount,
          badgeAriaText: plaudNeedsReviewCount
            ? `${plaudNeedsReviewCount} ${plaudNeedsReviewCount === 1 ? 'grabación' : 'grabaciones'} por revisar`
            : undefined,
        }
        : item,
    ),
    [plaudNeedsReviewCount],
  );

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
  const groupHasActiveItem = (items: NavItemDef[]) => items.some((item) => isActive(item.url));

  const handleNavigation = (url: string) => {
    navigate(url);
    // Always close sidebar on navigation - on desktop this has no effect
    setOpenMobile(false);
  };

  const NavItem = ({ item }: { item: NavItemDef }) => (
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
            if (isMobile) {
              setOpenMobile(false);
            }
          }}
          className="flex items-center gap-3"
        >
          <Icon name={item.icon} className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.title}</span>
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  const CollapsibleNavGroup = ({
    label,
    icon,
    items,
  }: {
    label: string;
    icon: string;
    items: NavItemDef[];
  }) => {
    const hasActive = groupHasActiveItem(items);
    const [open, setOpen] = useState(hasActive);
    // Suma de avisos de los ítems del grupo, para que se note en el disparador "Más" aunque
    // esté cerrado — si no, un aviso escondido dentro de un submenú plegado no avisa de nada.
    const groupBadgeCount = items.reduce((sum, item) => sum + (item.badgeCount ?? 0), 0);

    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              isActive={hasActive}
              className="cursor-pointer transition-colors"
              aria-label={groupBadgeCount > 0 ? `${label}, ${groupBadgeCount} ${groupBadgeCount === 1 ? 'pendiente' : 'pendientes'}` : undefined}
            >
              <Icon name={icon} className="h-4 w-4 shrink-0" />
              <span className="truncate flex-1 text-left">{label}</span>
              {groupBadgeCount > 0 && (
                <Badge
                  variant="destructive"
                  aria-hidden="true"
                  className="h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[10px] leading-none"
                >
                  {groupBadgeCount}
                </Badge>
              )}
              <Icon
                name="expand_more"
                className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {items.map((item) => (
                <SidebarMenuSubItem key={item.url}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={isActive(item.url)}
                    className="cursor-pointer"
                  >
                    <a
                      onClick={(e) => {
                        e.preventDefault();
                        handleNavigation(item.url);
                        if (isMobile) setOpenMobile(false);
                      }}
                      className="flex items-center gap-2"
                      aria-label={item.badgeAriaText ? `${item.title}, ${item.badgeAriaText}` : undefined}
                    >
                      <Icon name={item.icon} className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate flex-1">{item.title}</span>
                      {!!item.badgeCount && (
                        <Badge
                          variant="destructive"
                          aria-hidden="true"
                          className="h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] leading-none"
                        >
                          {item.badgeCount}
                        </Badge>
                      )}
                    </a>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  };

  return (
    <>
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary">
            <Icon name="psychology" className="h-6 w-6 text-sidebar-primary-foreground" />
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
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <NavItem key={item.url} item={item} />
              ))}
              <CollapsibleNavGroup label="Finanzas" icon="account_balance_wallet" items={financeNavItems} />
              <CollapsibleNavGroup label="Más" icon="apps" items={moreNavItems} />
              {isAdmin && (
                <CollapsibleNavGroup label="Administración" icon="admin_panel_settings" items={adminOnlyNavItems} />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="flex flex-col gap-2">
          <SidebarMenu>
            <NavItem item={settingsNavItem} />
          </SidebarMenu>

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
              {isDark ? <Icon name="light_mode" className="h-4 w-4" /> : <Icon name="dark_mode" className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              className="flex-1 text-sidebar-foreground hover:bg-destructive hover:text-destructive-foreground"
            >
              <Icon name="logout" className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>

    <MyProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}
