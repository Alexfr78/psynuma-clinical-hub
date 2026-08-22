# Portal del paciente - Fase 0: definición funcional y arquitectura

Fecha: 2026-08-22
Estado: propuesta para validación

## 1. Objetivo

Convertir el portal actual en el punto central de relación administrativa entre el paciente y el centro, manteniendo fuera del alcance inicial la historia clínica y cualquier información clínica sensible.

La primera evolución debe resolver cuatro necesidades:

- Saber cuál es la próxima cita y qué debe hacer el paciente.
- Gestionar citas sin depender del centro para operaciones habituales.
- Consultar documentos y pagos desde un único lugar.
- Entender con claridad qué información se almacena y qué acciones puede realizar.

## 2. Alcance actual confirmado

El repositorio dispone de estas rutas y capacidades relacionadas:

- `/portal/:slug`: acceso al portal mediante código por WhatsApp o correo.
- `/portal/:slug/dashboard`: citas, historial, facturas, reserva y tarjeta guardada.
- `/consentimiento/:token`: firma de consentimientos mediante enlace independiente.
- `/evaluacion/:token` y `/emo/:token`: cumplimentación de evaluaciones mediante enlace independiente.
- `/registro/:token`: autorregistro mediante enlace independiente.
- `/factura/:token`: visualización de factura mediante enlace independiente.
- `/pagar/:token`: pago de deuda mediante enlace independiente.
- `/book/:centerSlug`: reserva pública sin autenticación previa.

Conclusión de alcance: el portal tiene una base sólida de citas y facturación, pero todavía no agrupa los documentos y pagos que ya existen en otros flujos.

## 3. Arquitectura de información propuesta

### Inicio

Contenido prioritario:

- Próxima cita, si existe.
- Estado de la cita: pendiente, confirmada, cancelada o pendiente de pago.
- Modalidad: presencial u online.
- Ubicación o acceso a videollamada.
- Avisos de documentos o pagos pendientes.
- Acciones rápidas: ver cita, reprogramar, cancelar y solicitar cita.

Estado vacío:

- Mensaje claro cuando no hay citas.
- Acción visible para solicitar una cita.
- Información de contacto del centro.

### Citas

- Próximas citas.
- Historial de citas completadas.
- Citas canceladas, identificadas de forma separada.
- Detalle completo de cada cita.
- Confirmación, cancelación y reprogramación.
- Añadir al calendario.
- Acceso a videollamada cuando corresponda.

### Documentos

- Consentimientos pendientes.
- Evaluaciones pendientes.
- Autorregistros activos.
- Documentos completados.
- Facturas, con acceso adicional desde Pagos.

Cada elemento debe tener uno de estos estados: pendiente, en curso, completado, caducado o revocado.

### Pagos

- Deudas pendientes.
- Pagos realizados.
- Facturas emitidas.
- Bonos y sesiones restantes.
- Método de pago guardado.

### Mi cuenta

- Nombre y datos de contacto.
- Preferencias de comunicación.
- Datos del centro.
- Canales de ayuda administrativa.
- Cierre de sesión.

## 4. Navegación

### Móvil

Se propone una navegación inferior de cinco destinos como máximo:

1. Inicio.
2. Citas.
3. Documentos.
4. Pagos.
5. Mi cuenta.

Los iconos siempre deben ir acompañados de texto. No se debe depender de iconos aislados para identificar una sección.

### Escritorio

Se puede utilizar una navegación lateral con las mismas cinco áreas y una jerarquía visual equivalente. La estructura no debe cambiar entre móvil y escritorio, solo la disposición.

## 5. Matriz inicial de permisos

| Área | Consultar | Crear o iniciar | Modificar | Eliminar o revocar |
|---|---|---|---|---|
| Próximas citas | Sí, solo propias | Solicitar cita | Reprogramar | Cancelar propia según política |
| Historial de citas | Sí, solo propio | No | No | No |
| Facturas | Sí, solo propias | No | No | No |
| Deudas | Sí, solo propias | Iniciar pago | No | No |
| Bonos | Sí, solo propios | Según configuración del centro | No | No |
| Documentos pendientes | Sí, solo propios | Completar o firmar | Solo mientras estén abiertos | No |
| Datos personales | Sí, propios | Solicitar cambio | Con verificación | No |
| Método de pago | Ver marca y últimos cuatro dígitos | Guardar mediante Stripe | Sustituir mediante nuevo flujo | Quitar propio |
| Información clínica | No en la primera fase | No | No | No |
| Notas internas | No | No | No | No |

Regla transversal: ninguna función debe autorizar una operación únicamente mediante un `id` recibido desde el navegador. Debe validar token, paciente, centro y recurso.

## 6. Información que no se debe exponer en esta fase

Queda fuera del portal inicial:

- Notas de sesión.
- Diagnósticos.
- Informes clínicos.
- Resultados de evaluaciones psicológicas.
- Transcripciones.
- Informes generados por IA.
- Información de otros profesionales o pacientes.
- Documentación interna del centro.

Los consentimientos, evaluaciones y autorregistros podrán integrarse como tareas o enlaces pendientes, pero no se mostrarán automáticamente sus resultados clínicos.

## 7. Contrato de datos inicial

Las respuestas públicas del portal solo deben incluir los datos necesarios para presentar la interfaz y completar la operación.

### Cita

- `id`.
- Fecha, hora de inicio y hora de fin.
- Tipo y duración.
- Estado.
- Modalidad.
- Profesional visible para el paciente.
- Ubicación pública o enlace de videollamada.
- Estado de pago.
- Acciones permitidas calculadas por el servidor.

No incluir notas internas, identificadores de integración ni campos que no se representen en la interfaz.

### Factura

- Número.
- Fecha.
- Importe.
- Estado.
- Enlace seguro de consulta o descarga.

No exponer tokens ni campos internos salvo que formen parte de un enlace seguro ya validado por el servidor.

### Documento

- Tipo.
- Título.
- Estado.
- Fecha de creación o caducidad.
- Acción disponible.
- Enlace tokenizado de un solo propósito cuando proceda.

## 8. Decisiones de producto pendientes

Antes de comenzar la fase de interfaz deben validarse estas decisiones:

- Si los bonos se mostrarán desde el primer lanzamiento.
- Si se mostrarán deudas dentro del portal o solo mediante enlaces de pago.
- Si el paciente podrá cambiar directamente teléfono y correo o solo solicitar el cambio.
- Si el centro permitirá que el paciente elija profesional.
- Qué proveedores de videollamada se mostrarán: Zoom, Google Meet u otros.
- Si el centro podrá activar o desactivar cada módulo del portal por separado.
- Si los documentos pendientes aparecerán en Inicio como aviso.
- Qué canal de soporte se mostrará al paciente.

Recomendación: activar los módulos mediante configuración del centro, pero mantener Inicio, Citas y Mi cuenta como módulos base.

## 9. Criterios de aceptación de la fase 0

La fase 0 se considera completada cuando:

- La arquitectura de información está aprobada.
- La navegación móvil y de escritorio está definida.
- La matriz de permisos está validada.
- Se ha separado explícitamente la información administrativa de la clínica.
- Los contratos de datos iniciales están definidos.
- Las decisiones pendientes tienen responsable y respuesta.
- Seguridad ha confirmado que las operaciones no dependerán de identificadores aislados.
- Existe una lista de pruebas para pacientes, centros, tokens caducados y recursos ajenos.

## 10. Orden posterior de implantación

Una vez validado este documento, el desarrollo debe continuar en este orden:

1. Correcciones de autorización y minimización de datos.
2. Nueva estructura visual y pantalla de Inicio.
3. Rediseño de Citas.
4. Integración de Pagos, Facturas y Bonos.
5. Integración de Documentos.
6. Mi cuenta y preferencias.
7. Piloto con un centro antes de la activación general.
