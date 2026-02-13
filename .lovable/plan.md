

## Corregir etiqueta del boton de cobro de deuda

### Problema
El boton siempre muestra "Cobrar y facturar" cuando se cobra una deuda, incluso si el checkbox "Generar factura al registrar el pago" esta desmarcado. Esto genera confusion, pero la logica interna es correcta: si el checkbox esta desmarcado, NO se genera factura.

### Confirmacion
He revisado el codigo y puedo confirmar que:
- Linea 193: `if (showInvoiceOption && values.generate_invoice && debtInfo?.bonoId)` - solo crea factura si `generate_invoice` es `true`
- Si esta desmarcado, salta directamente al cobro en linea 230 sin crear factura
- **La logica funciona correctamente, el problema es solo la etiqueta del boton**

### Solucion

Cambiar la etiqueta del boton para que refleje el estado del checkbox:

#### `src/components/payments/RecordPaymentDialog.tsx`

En la linea 517, cambiar:
```
isDebtPayment ? 'Cobrar y facturar' : 'Registrar pago'
```
Por:
```
isDebtPayment
  ? (watchGenerateInvoice && showInvoiceOption ? 'Cobrar y facturar' : 'Registrar cobro')
  : 'Registrar pago'
```

Asi el boton dira:
- **"Cobrar y facturar"** cuando el checkbox esta marcado
- **"Registrar cobro"** cuando el checkbox esta desmarcado o no hay opcion de factura
- **"Registrar pago"** para pagos normales (sin deuda)

### Archivos a modificar
- `src/components/payments/RecordPaymentDialog.tsx` - Solo cambiar la etiqueta del boton (1 linea)
