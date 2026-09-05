import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Icon } from "@/components/ui/icon";

interface PlaudConnectionStatus {
  connected: boolean;
  plaud_account_label?: string | null;
  enabled?: boolean | null;
  needs_reconnect?: boolean | null;
  last_error?: string | null;
  created_at?: string | null;
}

export function PlaudIntegrationSection() {
  const { profile, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ["plaud-connection", profile?.center_id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<PlaudConnectionStatus>("plaud-connection", {
        body: { action: "status" },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.center_id,
  });

  useEffect(() => {
    const oauthStatus = searchParams.get("oauth");
    const provider = searchParams.get("provider");

    if (oauthStatus && provider === "plaud") {
      if (oauthStatus === "success") {
        toast.success("Plaud conectado correctamente");
        queryClient.invalidateQueries({ queryKey: ["plaud-connection"] });
      } else if (oauthStatus === "error") {
        const message = searchParams.get("message");
        toast.error(`Error al conectar Plaud: ${message || "Error desconocido"}`);
      }
      searchParams.delete("oauth");
      searchParams.delete("provider");
      searchParams.delete("message");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, queryClient]);

  const handleConnect = async () => {
    try {
      const { data, error } = await supabase.functions.invoke<{ authorize_url: string }>("plaud-oauth-start", {
        body: {},
      });
      if (error || !data?.authorize_url) {
        throw error || new Error("Respuesta inválida");
      }
      window.location.href = data.authorize_url;
    } catch (err) {
      console.error(err);
      toast.error("No se pudo iniciar la conexión con Plaud");
    }
  };

  const handleDisconnect = async () => {
    try {
      const { error } = await supabase.functions.invoke("plaud-connection", {
        body: { action: "disconnect" },
      });
      if (error) throw error;
      toast.success("Plaud desconectado");
      queryClient.invalidateQueries({ queryKey: ["plaud-connection"] });
    } catch (err) {
      toast.error("Error al desconectar Plaud");
    }
  };

  const handleToggleEnabled = async (checked: boolean) => {
    try {
      const { error } = await supabase.functions.invoke("plaud-connection", {
        body: { action: "set_enabled", enabled: checked },
      });
      if (error) throw error;
      toast.success(checked ? "Ingesta automática activada" : "Ingesta automática desactivada");
      queryClient.invalidateQueries({ queryKey: ["plaud-connection"] });
    } catch (err) {
      toast.error("No se pudo actualizar la ingesta automática");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10">
            <Icon name="mic" className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <CardTitle className="text-lg">Plaud (grabaciones)</CardTitle>
            <CardDescription>
              Conecta la cuenta de Plaud para leer grabaciones y transcripciones ya existentes y, más adelante,
              generar automáticamente los informes de sesión a partir de ellas.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.connected ? (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 gap-1">
                <Icon name="check_circle" className="h-3 w-3" />
                Conectado
              </Badge>
              {status.needs_reconnect && (
                <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 gap-1">
                  <Icon name="error" className="h-3 w-3" />
                  Requiere reconexión
                </Badge>
              )}
            </div>
            {status.plaud_account_label && (
              <p className="text-sm text-muted-foreground">Cuenta: {status.plaud_account_label}</p>
            )}
            {status.last_error && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">{status.last_error}</AlertDescription>
              </Alert>
            )}

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="plaud-enabled" className="text-sm font-medium">
                    Ingesta automática
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Con esto activado, Psycma buscará periódicamente grabaciones nuevas en la cuenta conectada
                    para emparejarlas con sesiones y generar informes.
                  </p>
                </div>
                <Switch
                  id="plaud-enabled"
                  checked={!!status.enabled}
                  disabled={!isAdmin || !!status.needs_reconnect}
                  onCheckedChange={handleToggleEnabled}
                />
              </div>
              <Alert>
                <AlertDescription className="text-xs">
                  Antes de activarla, confirma con Plaud el contrato de encargado de tratamiento de datos: las
                  grabaciones contienen información clínica de pacientes y no deben procesarse por un tercero sin
                  esa base legal cerrada. Mientras tanto, deja este interruptor apagado.
                </AlertDescription>
              </Alert>
            </div>

            {isAdmin && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleConnect}>
                  Reconectar
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDisconnect} className="text-destructive hover:text-destructive">
                  Desconectar
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              No conectado. La ingesta automática de grabaciones no está disponible hasta que se conecte una
              cuenta de Plaud.
            </p>
            {isAdmin ? (
              <Button size="sm" onClick={handleConnect} className="gap-2">
                <Icon name="mic" className="h-4 w-4" />
                Conectar Plaud
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Solo un administrador del centro puede conectar Plaud.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
