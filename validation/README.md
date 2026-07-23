# Validación del exportador CSV de facturas

`invoice-export-validation-v2.csv` es un archivo de prueba sintético generado por
`scripts/generate-invoice-export-validation.ts`.

Los identificadores, hashes y códigos que empiezan por `VALIDATION_ONLY_` no son datos
fiscales reales y no deben importarse en producción. Sirven únicamente para comprobar
el formato, el encadenamiento de filas de alta/anulación y la estabilidad del esquema.
El exportador de producción nunca genera esos valores: solo copia los almacenados.
