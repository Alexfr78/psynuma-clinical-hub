import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export default function PublicShortLinkRedirect() {
  const { code } = useParams<{ code: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const resolve = async () => {
      if (!code) {
        setError("Enlace no válido");
        return;
      }

      const { data, error: invokeError } = await supabase.functions.invoke("resolve-public-short-link", {
        body: { code },
      });

      if (!active) return;
      if (invokeError || !data?.destination) {
        setError(data?.error || invokeError?.message || "Este enlace no existe o ha caducado");
        return;
      }

      window.location.replace(data.destination);
    };

    resolve().catch((resolveError) => {
      if (active) setError(resolveError instanceof Error ? resolveError.message : "No se pudo abrir el enlace");
    });

    return () => {
      active = false;
    };
  }, [code]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="py-10 text-center">
          {error ? (
            <>
              <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
              <p className="text-muted-foreground">{error}</p>
            </>
          ) : (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Abriendo enlace...</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
