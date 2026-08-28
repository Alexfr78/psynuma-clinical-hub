import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { NotificationCard } from '@/components/notifications/NotificationCard';
import { WhatsAppLinkDialog } from '@/components/agenda/WhatsAppLinkDialog';
import { useNotifications, useSendNotification, usePendingNotifications, useDeleteNotification, NotificationWithRelations } from '@/hooks/useNotifications';
import { Icon } from '@/components/ui/icon';

export default function Notifications() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [whatsappDialog, setWhatsappDialog] = useState<{
    open: boolean;
    phone: string;
    message: string;
    patientName: string;
  } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [notificationToDelete, setNotificationToDelete] = useState<NotificationWithRelations | null>(null);

  const { data: notifications, isLoading } = useNotifications({
    status: statusFilter !== 'all' ? statusFilter : undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
  });
  const { data: pendingNotifications } = usePendingNotifications();
  const sendNotification = useSendNotification();
  const deleteNotification = useDeleteNotification();

  const stats = {
    total: notifications?.length || 0,
    pending: notifications?.filter(n => n.status === 'pending').length || 0,
    sent: notifications?.filter(n => n.status === 'sent').length || 0,
    failed: notifications?.filter(n => n.status === 'failed').length || 0,
  };

  const handleSendNotification = async (id: string, notification?: NotificationWithRelations) => {
    const result = await sendNotification.mutateAsync(id);
    
    // Check if this was a WhatsApp Web notification
    const whatsappWebResult = result?.results?.find(r => r.type === 'whatsapp' && r.whatsappWebLink);
    
    if (whatsappWebResult && notification) {
      // Open the WhatsApp dialog
      setWhatsappDialog({
        open: true,
        phone: notification.recipient,
        message: notification.message,
        patientName: notification.patients 
          ? `${notification.patients.first_name} ${notification.patients.last_name}`
          : 'Contacto',
      });
    }
  };

  const handleProcessPending = async () => {
    if (!pendingNotifications?.length) return;
    
    for (const notification of pendingNotifications) {
      const result = await sendNotification.mutateAsync(notification.id);
      
      // For WhatsApp web mode, open dialog for each
      const whatsappWebResult = result?.results?.find(r => r.type === 'whatsapp' && r.whatsappWebLink);
      if (whatsappWebResult) {
        setWhatsappDialog({
          open: true,
          phone: notification.recipient,
          message: notification.message,
          patientName: 'Contacto', // Pending notifications don't have patient data loaded
        });
        // Wait for user to close dialog before processing next
        break;
      }
    }
  };

  const handleDeleteNotification = (notification: NotificationWithRelations) => {
    setNotificationToDelete(notification);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Notificaciones</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona recordatorios y comunicaciones
          </p>
        </div>
        {pendingNotifications && pendingNotifications.length > 0 && (
          <Button onClick={handleProcessPending} disabled={sendNotification.isPending} className="w-full sm:w-auto">
            {sendNotification.isPending && <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />}
            <span className="sm:hidden">Procesar ({pendingNotifications.length})</span>
            <span className="hidden sm:inline">Procesar {pendingNotifications.length} pendientes</span>
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Total</CardTitle>
            <Icon name="notifications" className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="text-lg sm:text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Pendientes</CardTitle>
            <Icon name="schedule" className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="text-lg sm:text-2xl font-bold text-amber-500">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Enviadas</CardTitle>
            <Icon name="check_circle" className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="text-lg sm:text-2xl font-bold text-green-500">{stats.sent}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Fallidas</CardTitle>
            <Icon name="cancel" className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="text-lg sm:text-2xl font-bold text-destructive">{stats.failed}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="px-3 sm:px-6 pt-3 sm:pt-6 pb-2 sm:pb-4">
          <CardTitle className="text-sm sm:text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
          <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 sm:gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="sent">Enviadas</SelectItem>
                <SelectItem value="failed">Fallidas</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="email">
                  <span className="flex items-center gap-2">
                    <Icon name="mail" className="h-4 w-4" /> Email
                  </span>
                </SelectItem>
                <SelectItem value="sms">
                  <span className="flex items-center gap-2">
                    <Icon name="call" className="h-4 w-4" /> SMS
                  </span>
                </SelectItem>
                <SelectItem value="whatsapp">
                  <span className="flex items-center gap-2">
                    <Icon name="forum" className="h-4 w-4" /> WhatsApp
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Notifications List */}
      <Tabs defaultValue="all" className="space-y-4">
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-background to-transparent pointer-events-none z-10 sm:hidden" />
          <div className="absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-l from-background to-transparent pointer-events-none z-10 sm:hidden" />
          <TabsList className="w-full sm:w-auto justify-start overflow-x-auto flex-nowrap gap-1 h-auto p-1">
            <TabsTrigger value="all" className="flex-shrink-0 text-xs sm:text-sm px-3 py-2 min-h-[40px]">Todas</TabsTrigger>
            <TabsTrigger value="pending" className="flex items-center gap-1 flex-shrink-0 text-xs sm:text-sm px-3 py-2 min-h-[40px]">
              <span className="hidden sm:inline">Pendientes</span>
              <span className="sm:hidden">Pend.</span>
              {stats.pending > 0 && (
                <Badge variant="secondary" className="h-5 min-w-5 px-1 flex items-center justify-center text-xs">
                  {stats.pending}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sent" className="flex-shrink-0 text-xs sm:text-sm px-3 py-2 min-h-[40px]">
              <span className="hidden sm:inline">Enviadas</span>
              <span className="sm:hidden">Env.</span>
            </TabsTrigger>
            <TabsTrigger value="failed" className="flex-shrink-0 text-xs sm:text-sm px-3 py-2 min-h-[40px]">
              <span className="hidden sm:inline">Fallidas</span>
              <span className="sm:hidden">Fall.</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Icon name="progress_activity" className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <TabsContent value="all" className="space-y-4">
              {notifications?.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Icon name="notifications" className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No hay notificaciones</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {notifications?.map((notification) => (
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      onSend={(id) => handleSendNotification(id, notification)}
                      onDelete={() => handleDeleteNotification(notification)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="pending" className="space-y-4">
              <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {notifications
                  ?.filter((n) => n.status === 'pending')
                  .map((notification) => (
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      onSend={(id) => handleSendNotification(id, notification)}
                      onDelete={() => handleDeleteNotification(notification)}
                    />
                  ))}
              </div>
            </TabsContent>

            <TabsContent value="sent" className="space-y-4">
              <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {notifications
                  ?.filter((n) => n.status === 'sent')
                  .map((notification) => (
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      onDelete={() => handleDeleteNotification(notification)}
                    />
                  ))}
              </div>
            </TabsContent>

            <TabsContent value="failed" className="space-y-4">
              <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {notifications
                  ?.filter((n) => n.status === 'failed')
                  .map((notification) => (
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      onSend={(id) => handleSendNotification(id, notification)}
                      onDelete={() => handleDeleteNotification(notification)}
                    />
                  ))}
              </div>
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* WhatsApp Link Dialog */}
      {whatsappDialog && (
        <WhatsAppLinkDialog
          open={whatsappDialog.open}
          onOpenChange={(open) => !open && setWhatsappDialog(null)}
          phone={whatsappDialog.phone}
          message={whatsappDialog.message}
          patientName={whatsappDialog.patientName}
        />
      )}

      {/* Delete Notification Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar notificación?</AlertDialogTitle>
            <AlertDialogDescription>
              {notificationToDelete && (
                <>
                  Se eliminará la notificación de tipo <strong>{notificationToDelete.type}</strong> destinada a{' '}
                  <strong>{notificationToDelete.recipient}</strong>. Esta acción no se puede deshacer.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (notificationToDelete) {
                  await deleteNotification.mutateAsync(notificationToDelete.id);
                  setNotificationToDelete(null);
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
