# Validación del exportador CSV de facturas

`invoice-export-2026-02-01-to-2026-07-18-v2.csv` es un archivo de prueba sintético generado por
`scripts/generate-invoice-export-validation.ts`.

Representa una exportación cuyo rango se aplica a `invoice_date`, desde el
1 de febrero hasta el 18 de julio de 2026, con canceladas incluidas y borradores
excluidos.

Los identificadores, hashes y códigos que empiezan por `VALIDATION_ONLY_` no son datos
fiscales reales y no deben importarse en producción. Sirven únicamente para comprobar
el formato, el encadenamiento de filas de alta/anulación y la estabilidad del esquema.
El exportador de producción nunca genera esos valores: solo copia los almacenados.
