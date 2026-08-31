import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { useCenter } from '@/hooks/useCenter';
import { Icon } from '@/components/ui/icon';

export function ResponsibleDeclarationSection() {
  const { center } = useCenter();

  const softwareInfo = {
    name: center?.verifactu_sistema_informatico || 'Psycma',
    version: center?.verifactu_software_version || 'No configurada',
    nif: center?.verifactu_software_nif || center?.tax_id || '—',
    modalidad: 'VeriFactu',
    fechaDeclaracion: new Date().toLocaleDateString('es-ES')
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Icon name="balance" className="h-5 w-5 text-primary" />
            <CardTitle>Declaración Responsable</CardTitle>
          </div>
          <CardDescription>
            Información obligatoria del software de facturación según el RD 1007/2023
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border bg-muted/50 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Icon name="shield" className="h-5 w-5 text-green-600" />
              <h3 className="font-semibold text-lg">Sistema VeriFactu Certificado</h3>
              <Badge variant="default" className="bg-green-600">Activo</Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Nombre del Software</p>
                <p className="font-medium">{softwareInfo.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Versión</p>
                <p className="font-medium">{softwareInfo.version}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Modalidad</p>
                <p className="font-medium">{softwareInfo.modalidad}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fecha de Declaración</p>
                <p className="font-medium">{softwareInfo.fechaDeclaracion}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Icon name="task" className="h-5 w-5 text-primary" />
              <h4 className="font-medium">Texto de la Declaración Responsable</h4>
            </div>
            
            <div className="text-sm text-muted-foreground space-y-3 leading-relaxed">
              <p>
                El productor del sistema informático de facturación <strong>{softwareInfo.name}</strong>, 
                versión <strong>{softwareInfo.version}</strong>, declara bajo su responsabilidad que:
              </p>
              
              <ol className="list-decimal list-inside space-y-2 ml-4">
                <li>
                  El sistema cumple con los requisitos establecidos en el Reglamento de los sistemas 
                  informáticos de facturación (Real Decreto 1007/2023).
                </li>
                <li>
                  El sistema garantiza la integridad, conservación, accesibilidad, legibilidad, 
                  trazabilidad e inalterabilidad de los registros de facturación.
                </li>
                <li>
                  El sistema implementa el encadenamiento de registros mediante hash SHA-256 
                  conforme a las especificaciones técnicas de la AEAT.
                </li>
                <li>
                  El sistema permite el envío automático de los registros de facturación a la 
                  Agencia Estatal de Administración Tributaria (modalidad VeriFactu).
                </li>
                <li>
                  El sistema genera códigos QR de verificación en todas las facturas emitidas, 
                  permitiendo su validación en la sede electrónica de la AEAT.
                </li>
                <li>
                  El sistema mantiene un registro de eventos que documenta todas las operaciones 
                  realizadas sobre los registros de facturación.
                </li>
                <li>
                  Los registros de facturación no pueden ser modificados ni eliminados una vez 
                  firmados y enviados a la AEAT.
                </li>
              </ol>

              <p className="pt-2 border-t">
                Esta declaración se realiza en cumplimiento del artículo 7 del Real Decreto 1007/2023, 
                de 5 de diciembre, por el que se aprueba el Reglamento que establece los requisitos 
                que deben adoptar los sistemas y programas informáticos o electrónicos que soporten 
                los procesos de facturación de empresarios y profesionales.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
