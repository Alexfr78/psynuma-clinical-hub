-- Alta de la plantilla de consentimiento para grabación, IA e informes.
-- Se crea en TODOS los centros, pero activa solo en el centro que usa Plaud;
-- en los demás queda inactiva para que su responsable la revise y la active.
-- Idempotente: no duplica si ya existe una plantilla con el mismo nombre.

-- =============================================================================
-- Plantilla de consentimiento: Grabación, Transcripción y Generación de
-- Informes de Sesión mediante Inteligencia Artificial (integración Plaud)
-- =============================================================================
--
-- NO EJECUTADO. Este archivo es solo el SQL listo para que el propietario lo
-- ejecute manualmente (p. ej. en el SQL editor de Supabase) cuando decida
-- desplegarlo, agrupado con el resto de cambios pendientes.
--
-- INSTRUCCIONES:
--   1) Sustituye el marcador  2ccac3f3-e957-49b6-b2c0-867bedfecda7  (aparece dos veces más abajo, una
--      en el SELECT y otra en el WHERE EXISTS) por el UUID real de
--      `centers.id` del centro para el que se crea esta plantilla.
--   2) Revisa el HTML y las cinco casillas de verificación antes de ejecutar.
--   3) El texto legal (aviso breve y contenido completo) procede de la
--      sección 2 de cumplimiento-legal-plaud.md, redactado por el agente de
--      cumplimiento normativo. Sigue marcado como [SUPUESTO] en varios
--      puntos en ese documento: un jurista debe validarlo antes de su uso
--      real con pacientes.
--   4) `requires_guardian_signature` y `requires_emergency_contact` se dejan
--      en `false`: este consentimiento no es el de tratamiento general del
--      menor ni pide contacto de emergencia (ver nota en la sección 2.4 del
--      documento de cumplimiento). Ajusta si el centro lo necesita distinto.
--
-- DECISIÓN DE ADAPTACIÓN (respecto al listado de checkboxes de la sección 2.4
-- del documento de cumplimiento, que describía 5 casillas con un reparto
-- ligeramente distinto):
--   - El contrato fijado para `checkPatientConsent()` exige que las claves de
--     las 5 casillas sean EXACTAMENTE las 5 `ConsentPurpose`
--     (recording | ai_processing | report_generation | channel_whatsapp |
--     channel_email). El documento original agrupaba "informe clínico
--     interno" e "informe para el paciente" en dos casillas distintas (sus
--     puntos 3 y 4), y el canal de envío en una sola casilla con
--     sub-selección (su punto 5). Para respetar el contrato de código sin
--     perder alcance legal:
--       * Los antiguos puntos 3 y 4 (generación de informe clínico interno /
--         informe para el paciente) se fusionan en UNA casilla bajo la clave
--         `report_generation`, cuyo texto cubre ambos informes explícitamente.
--       * El antiguo punto 5 (elección de canal) se separa en DOS casillas
--         independientes, `channel_whatsapp` y `channel_email`, en lugar de
--         una casilla con sub-selección — así cada canal es una autorización
--         verdaderamente independiente, como exige el diseño granular.
--     El contenido jurídico (qué se autoriza, qué implica, qué pasa si se
--     revoca) no se ha alterado: solo se ha reagrupado en 5 casillas para
--     encajar 1:1 con las 5 finalidades técnicas del contrato.
--
-- =============================================================================

INSERT INTO public.consent_templates (
  center_id,
  name,
  content_html,
  verification_checkboxes,
  requires_guardian_signature,
  requires_emergency_contact,
  is_active
)
SELECT
  c.id,
  'Consentimiento Informado — Grabación, Transcripción y Generación de Informes de Sesión mediante Inteligencia Artificial',
  $consent_html$<h2>Consentimiento Informado — Grabación, Transcripción y Generación de Informes de Sesión mediante Inteligencia Artificial</h2>

<p><strong>Antes de firmar, en pocas palabras:</strong></p>
<ul>
  <li>Podemos grabar el audio de tu sesión de terapia si tú lo autorizas expresamente.</li>
  <li>Esa grabación se envía a un proveedor externo (Plaud) que la transcribe y genera un resumen usando inteligencia artificial (Azure OpenAI). Esto implica que tus datos viajan y se procesan fuera de la Unión Europea.</li>
  <li>Con el resultado, generamos un informe clínico (para tu terapeuta) y, si tú quieres, un informe para ti en lenguaje sencillo.</li>
  <li>Tú decides si quieres recibir ese informe, y por qué canal: WhatsApp, email o solo consultándolo en el portal de paciente.</li>
  <li>Puedes autorizar cada una de estas cosas por separado, y puedes retirar tu autorización en cualquier momento sin que ello afecte a la atención que recibes.</li>
  <li>Retirar tu consentimiento no borra los informes clínicos que ya formen parte de tu historia clínica, porque estamos legalmente obligados a conservarla un mínimo de 5 años.</li>
</ul>

<p>Yo, <strong>{nombre_paciente} {apellidos_paciente}</strong>, con DNI/NIE <strong>{dni_paciente}</strong>, he sido informado/a por {nombre_centro} de lo siguiente:</p>

<h3>1. Identidad del responsable del tratamiento</h3>
<p>El responsable del tratamiento de tus datos personales es {nombre_centro}, con quien puedes contactar para ejercer tus derechos o resolver dudas sobre este consentimiento. La información detallada de contacto está disponible en el aviso de privacidad general del centro.</p>

<h3>2. Qué se te propone y para qué</h3>
<p>Con el fin de mejorar el registro clínico y ofrecerte un resumen útil de cada sesión, tu terapeuta puede utilizar un dispositivo y una aplicación de terceros (Plaud) para:</p>
<ol>
  <li>Grabar el audio de la sesión de terapia.</li>
  <li>Enviar esa grabación a los servidores de Plaud, Inc. (con sede en EE. UU.), que la transcribe automáticamente y, en su caso, aplica inteligencia artificial de un subencargado (Microsoft Azure OpenAI) para generar un resumen.</li>
  <li>Utilizar esa transcripción o resumen, dentro de Psycma, para generar mediante inteligencia artificial dos documentos distintos: (a) un informe clínico de uso interno para tu terapeuta, y (b) —si tú lo autorizas— un informe redactado en lenguaje accesible para ti.</li>
  <li>Enviarte ese informe para ti, por el canal que elijas.</li>
</ol>
<p>Cada una de estas finalidades requiere tu autorización específica, marcada más abajo mediante casillas independientes. Puedes autorizar unas y rechazar otras.</p>
<p>{campos_verificacion}</p>

<h3>3. Qué datos se tratan</h3>
<p>El contenido de la grabación puede incluir datos relativos a tu salud, incluida tu salud mental, así como cualquier otra información sensible que menciones durante la sesión (por ejemplo, relativa a tu vida sexual, consumo de sustancias, creencias, o situación laboral o familiar). El sistema de inteligencia artificial que redacta los informes está instruido para sustituir nombres propios y datos identificativos por «PACIENTE» y «TERAPEUTA», pero no puede garantizarse una anonimización completa del contenido clínico.</p>

<h3>4. Transferencia internacional de datos</h3>
<p>Plaud, Inc. tiene su sede en Estados Unidos y opera centros de datos en Estados Unidos, Alemania (Fráncfort, UE), Singapur y Japón. Dependiendo de la configuración contratada por el centro, tu grabación y transcripción pueden procesarse fuera del Espacio Económico Europeo, incluido en Estados Unidos. Esta transferencia se realiza al amparo de las cláusulas contractuales tipo aprobadas por la Comisión Europea, incorporadas al contrato entre {nombre_centro} y Plaud. Puedes solicitar más información sobre esta transferencia a tu terapeuta.</p>

<h3>5. Conservación y tus derechos</h3>
<p>La grabación y la transcripción sin procesar se conservan en los sistemas de Plaud según la política de retención de ese proveedor, hasta que {nombre_centro} o tú solicitéis su borrado. El informe clínico generado, una vez incorporado a tu historia clínica, se conserva conforme a la Ley 41/2002 (mínimo 5 años desde el alta del proceso asistencial), con independencia de que retires este consentimiento.</p>
<p><strong>Si retiras tu consentimiento en cualquier momento:</strong> dejaremos de grabar tus sesiones y de enviarlas a Plaud a partir de ese momento. Los informes clínicos que ya formen parte de tu historia clínica no se eliminarán, porque {nombre_centro} está legalmente obligado a conservarlos. Sí podrás solicitar el borrado de la grabación de audio y la transcripción almacenadas en Plaud que no formen parte de tu historia clínica.</p>
<p>Tienes derecho a acceder, rectificar, suprimir (en los términos anteriores), limitar el tratamiento, oponerte, solicitar la portabilidad de tus datos, y a no ser objeto de decisiones automatizadas. Puedes ejercer estos derechos dirigiéndote a {nombre_centro}, y presentar una reclamación ante la Agencia Española de Protección de Datos (www.aepd.es) si consideras que tus derechos no han sido atendidos.</p>

<h3>6. Carácter voluntario</h3>
<p>Este consentimiento es libre, específico, informado e inequívoco. Tu decisión, en cualquiera de sus apartados, no condiciona la prestación del servicio terapéutico: puedes recibir tratamiento psicológico en {nombre_centro} sin necesidad de que se grabe la sesión ni se use inteligencia artificial.</p>

<p>En {nombre_centro}, a {fecha_actual}.</p>$consent_html$,
  '[
    {
      "key": "recording",
      "label": "Autorizo la grabación de audio de mis sesiones de terapia.",
      "required": true
    },
    {
      "key": "ai_processing",
      "label": "Autorizo que la grabación se envíe y sea tratada por Plaud, Inc. (EE. UU.) y su subencargado de inteligencia artificial (Microsoft Azure OpenAI), incluyendo la transferencia internacional de mis datos fuera de la Unión Europea, tal y como se describe en el apartado 4.",
      "required": true
    },
    {
      "key": "report_generation",
      "label": "Autorizo la generación mediante inteligencia artificial de informes de la sesión a partir de la transcripción: tanto el informe clínico de uso interno para mi terapeuta como, si se elabora, el informe redactado para mí en lenguaje accesible.",
      "required": true
    },
    {
      "key": "channel_whatsapp",
      "label": "Autorizo que se me envíe por WhatsApp el informe de la sesión redactado para mí (cuando se elabore). Si no marco esta casilla ni la de email, el informe solo estará disponible en el portal de paciente.",
      "required": true
    },
    {
      "key": "channel_email",
      "label": "Autorizo que se me envíe por email el informe de la sesión redactado para mí (cuando se elabore). Si no marco esta casilla ni la de WhatsApp, el informe solo estará disponible en el portal de paciente.",
      "required": true
    }
  ]'::jsonb,
  false,
  false,
  (c.id = '2ccac3f3-e957-49b6-b2c0-867bedfecda7'::uuid)
FROM public.centers c
WHERE NOT EXISTS (
  SELECT 1 FROM public.consent_templates t
  WHERE t.center_id = c.id AND t.name = $consent_name$Consentimiento Informado — Grabación, Transcripción y Generación de Informes de Sesión mediante Inteligencia Artificial$consent_name$
);