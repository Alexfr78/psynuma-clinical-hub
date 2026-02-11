
## Incluir fecha de sesion en la descripcion de facturas

### Problema
Al generar facturas desde el detalle de cita (cobro de sesion), la descripcion del concepto muestra "Sesion -" sin incluir la fecha ni el tipo de sesion, porque los props `sessionDate` y `sessionType` no se pasan al componente `CollectSessionPaymentDialog`.

### Solucion

#### 1. Pasar los props faltantes en `SessionDetailDrawer.tsx`

Anadir `sessionDate`, `sessionType`, `patientEmail` y `patientPhone` al componente `CollectSessionPaymentDialog` donde se invoca (linea ~1994):

```
sessionDate={session.session_date}
sessionType={session.session_type}
patientEmail={session.patient?.email}
patientPhone={session.patient?.phone}
```

#### 2. Mejorar el formato de la descripcion en `CollectSessionPaymentDialog.tsx`

Cambiar la logica de la descripcion (linea ~110-112) para que siempre incluya la fecha formateada de forma legible, coherente con el formato que ya usa `CreateSessionInvoiceDialog`:

De:
```
`${sessionType} - ${sessionDate ? format(..., 'dd/MM/yyyy') : 'Sesion'}`
```

A:
```
`Sesion de ${sessionType || 'psicoterapia'} - ${sessionDate ? format(new Date(sessionDate), "d 'de' MMMM yyyy", { locale: es }) : ''}`
```

Esto producira descripciones como: **"Sesion de Terapia individual - 11 de febrero de 2026"**

#### Archivos a modificar

- `src/components/agenda/SessionDetailDrawer.tsx` - Pasar props `sessionDate` y `sessionType`
- `src/components/agenda/CollectSessionPaymentDialog.tsx` - Mejorar formato de descripcion con fecha legible y locale espanol
