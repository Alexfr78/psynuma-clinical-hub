import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePublicAutoregistro } from '@/hooks/usePublicAutoregistro';
import { DynamicFormRenderer } from '@/components/autoregistros/DynamicFormRenderer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function AutoregistroPublic() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error, submitEntry } = usePublicAutoregistro(token ?? '');
  const [submitted, setSubmitted] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <p className="text-muted-foreground">Cargando formulario...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <p className="font-medium">Enlace no válido</p>
            <p className="text-sm text-muted-foreground mt-1">
              {(error as Error)?.message || 'Este enlace no existe o ha expirado.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-primary mx-auto mb-3" />
            <p className="font-medium text-lg">¡Registro enviado!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Gracias por completar el formulario.
            </p>
            {data.link.allow_multiple && (
              <button
                onClick={() => setSubmitted(false)}
                className="mt-4 text-sm text-primary underline"
              >
                Enviar otro registro
              </button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 flex justify-center">
      <div className="w-full max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{data.template.name}</CardTitle>
            {data.template.description && (
              <p className="text-sm text-muted-foreground">{data.template.description}</p>
            )}
          </CardHeader>
          <CardContent>
            <DynamicFormRenderer
              fields={data.template.fields}
              isSubmitting={submitEntry.isPending}
              onSubmit={(values) => {
                submitEntry.mutate(values, {
                  onSuccess: () => setSubmitted(true),
                });
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
