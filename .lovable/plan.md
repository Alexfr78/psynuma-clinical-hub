

## Diagnóstico de la factura SP260011

### Lo que he encontrado

**Factura SP260011** (id: `d1cb7056`):
- Creada el 02-03-2026, status `issued`, pero **nunca firmada** (`invoice_hash = null`, `verifactu_pending = true`, `verifactu_retry_count = 2`)
- Mientras tanto, otras facturas (SF260034, SP260012, SF260035, SF260036) se firmaron correctamente DESPUÉS

**El error AEAT**: `Codigo[103].Error interno del Servidor` con HTTP 403 es un error **interno del servidor de AEAT**, no un error de validación de datos. Los errores de validación tienen códigos como 1100, 1181, 4102. El código 103 indica un fallo transitorio del lado de AEAT.

### Bug real encontrado: `RegistroAnterior` incorrecto

Hay un bug en el XML que se envía a AEAT. En la sección `Encadenamiento > RegistroAnterior` (líneas 509-521 de `sign-invoice-verifactu/index.ts`), el código usa los datos de la **factura actual** en vez de la **factura anterior**:

```text
Actual (INCORRECTO):
  <RegistroAnterior>
    <NumSerieFactura>SP260011</NumSerieFactura>        ← la factura ACTUAL
    <FechaExpedicionFactura>02-03-2026</FechaExpedicionFactura>  ← fecha ACTUAL
    <Huella>CE39A5...28</Huella>                       ← hash de SF260036 ✓
  </RegistroAnterior>

Correcto (DEBERÍA SER):
  <RegistroAnterior>
    <NumSerieFactura>SF260036</NumSerieFactura>        ← la factura ANTERIOR
    <FechaExpedicionFactura>06-03-2026</FechaExpedicionFactura>  ← fecha ANTERIOR
    <Huella>CE39A5...28</Huella>                       ← hash de SF260036 ✓
  </RegistroAnterior>
```

Según la especificación VeriFactu, `RegistroAnterior` debe identificar el registro previo en la cadena. Actualmente todas las facturas se envían con datos erróneos en esos campos. Es posible que AEAT no los valide estrictamente (de ahí que las demás funcionen), pero es una infracción del XSD que puede causar rechazos intermitentes como el 103.

### Plan de actuación

#### 1. Corregir `RegistroAnterior` en la edge function

**Archivo**: `supabase/functions/sign-invoice-verifactu/index.ts`

- Ampliar la consulta a `verifactu_chain_status` para obtener también `ultima_factura_id`
- Cuando haya un `previousHash`, hacer un fetch de la factura anterior (`ultima_factura_id`) para obtener su `invoice_number` e `issue_date`
- Pasar esos datos a `buildRegistroAltaXML` como nuevos parámetros (`previousInvoiceNumber`, `previousInvoiceDate`)
- Usar esos datos en el bloque `RegistroAnterior` en vez de los de la factura actual

#### 2. Añadir botón de reintento manual en la UI

**Archivo**: `src/components/invoices/InvoiceDetailDialog.tsx`

- Cuando una factura tiene `verifactu_pending = true`, mostrar un botón "Reintentar registro AEAT"
- Al pulsar, invocar `sign-invoice-verifactu` con el `invoice_id`
- Mostrar toast con resultado (éxito o error)

#### 3. Reintentar la factura SP260011

Una vez desplegada la corrección, el usuario podrá usar el botón de reintento para registrar SP260011 con el `RegistroAnterior` correcto.

### Detalle técnico

**Cambio en `buildRegistroAltaXML`** — Nuevos parámetros:
```typescript
function buildRegistroAltaXML(
  invoice, center, patient, invoiceItems, 
  previousHash, generationTimestamp, invoiceHash,
  rectifiedInvoice,
  previousInvoiceNumber?: string,  // NUEVO
  previousInvoiceDate?: string     // NUEVO
)
```

**Cambio en `RegistroAnterior`**:
```typescript
if (previousHash && previousInvoiceNumber && previousInvoiceDate) {
  encadenamientoXML = `
    <sum1:RegistroAnterior>
      <sum1:IDEmisorFactura>${nifEmisor}</sum1:IDEmisorFactura>
      <sum1:NumSerieFactura>${sanitizeNumSerieFactura(previousInvoiceNumber)}</sum1:NumSerieFactura>
      <sum1:FechaExpedicionFactura>${formatDateVerifactu(previousInvoiceDate)}</sum1:FechaExpedicionFactura>
      <sum1:Huella>${previousHash}</sum1:Huella>
    </sum1:RegistroAnterior>`;
}
```

**Fetch de la factura anterior** (en el handler principal):
```typescript
let previousInvoiceNumber: string | undefined;
let previousInvoiceDate: string | undefined;
if (chainStatus?.ultima_factura_id) {
  const { data: prevInv } = await supabase
    .from("invoices")
    .select("invoice_number, issue_date")
    .eq("id", chainStatus.ultima_factura_id)
    .single();
  if (prevInv) {
    previousInvoiceNumber = prevInv.invoice_number;
    previousInvoiceDate = prevInv.issue_date;
  }
}
```

**Archivos a modificar**:
- `supabase/functions/sign-invoice-verifactu/index.ts` — corregir RegistroAnterior
- `src/components/invoices/InvoiceDetailDialog.tsx` — botón de reintento

