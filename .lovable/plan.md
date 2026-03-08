

## Plan: Unificar formato de factura PDF con la vista web

**Problema**: El HTML generado por la edge function `generate-invoice-pdf` tiene un diseño distinto (línea azul, tipografía formal, sin badges) al de la vista web (`InvoiceView.tsx`) que es la que prefieres.

**Solución**: Reescribir la función `generateInvoiceHTML` en la edge function para que produzca un HTML visualmente idéntico a la vista web.

### Cambios

1. **`supabase/functions/generate-invoice-pdf/index.ts`** — Reescribir `generateInvoiceHTML()`:
   - Fondo gris claro (`#f8fafc`) con tarjeta blanca centrada con bordes redondeados y sombra
   - Cabecera con logo a la izquierda, tipo de documento + número a la derecha
   - Sección "Datos del cliente" con fondo `muted` y borde redondeado
   - Tabla de conceptos con columnas: Concepto, Cant., Precio, IVA, IRPF, Total
   - Totales alineados a la derecha con separador antes del total final en azul/primario
   - Sección de notas con borde superior
   - QR Verifactu con badge y texto descriptivo
   - Footer del centro con texto centrado
   - Tipografía, colores y espaciado replicando exactamente los estilos de Tailwind usados en `InvoiceView.tsx`

2. **Redesplegar** la edge function tras el cambio

### Detalle técnico
- Se mantiene toda la lógica de fetching de datos, imágenes y QR base64 sin cambios
- Solo se modifica el template HTML y CSS dentro de `generateInvoiceHTML()`
- Los estilos CSS replicarán los valores de Tailwind: `text-primary` → `#2563eb`, `bg-muted/30` → `#f8fafc`, badges con bordes redondeados, etc.
- Se incluye `@media print` para eliminar padding extra al imprimir

