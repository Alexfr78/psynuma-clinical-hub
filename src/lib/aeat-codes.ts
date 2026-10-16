export interface AeatCode<T extends string = string> {
  code: T;
  literal: string;
}

const codes = <T extends string>(items: readonly (readonly [T, string])[]): readonly AeatCode<T>[] =>
  items.map(([code, literal]) => ({ code, literal }));

export const AEAT_ACTIVITY_CODES = codes([
  ['A', 'Actividades incluidas en el I.A.E.'],
  ['B', 'Actividades no incluidas en el I.A.E.'],
  ['C', 'Actividades no iniciadas'],
  ['D', 'Arrendadores de inmuebles no incluidos en los códigos anteriores'],
] as const);

export const AEAT_ACTIVITY_TYPES_A = codes([
  ['01', 'Arrendadores de bienes inmuebles'], ['02', 'Ganadería independiente'],
  ['03', 'Resto de actividades empresariales'], ['04', 'Actividades profesionales artísticas o deportivas'],
  ['05', 'Resto de actividades profesionales'],
] as const);
export const AEAT_ACTIVITY_TYPES_B = codes([
  ['01', 'Actividad agrícola'], ['02', 'Actividad ganadera dependiente'],
  ['03', 'Actividad forestal'], ['04', 'Producción del mejillón en batea'],
  ['05', 'Actividad pesquera, excepto producción de mejillón en batea'],
  ['06', 'Otras actividades no sujetas al I.A.E.'],
] as const);
export const AEAT_ACTIVITY_TYPES = AEAT_ACTIVITY_TYPES_B;

export const AEAT_ISSUED_INVOICE_TYPES = codes([
  ['F1', 'Factura con destinatario identificado'], ['F2', 'Factura sin destinatario identificado'],
  ['F3', 'Factura sustitutiva'], ['F4', 'Asiento resumen de facturas'],
  ['R1', 'Rectificativa - error fundado en derecho'], ['R2', 'Rectificativa - concurso'],
  ['R3', 'Rectificativa - crédito incobrable'], ['R4', 'Rectificativa - resto'],
  ['R5', 'Rectificativa de factura simplificada'], ['SF', 'Asiento sin obligación de emitir factura'],
  ['DV', 'Devolución en régimen de viajeros'], ['AJ', 'Ajuste periódico de IVA'],
] as const);

export const AEAT_RECEIVED_INVOICE_TYPES = codes([
  ['F1', 'Factura con destinatario identificado'], ['F2', 'Factura sin destinatario identificado'],
  ['F3', 'Factura sustitutiva'], ['F4', 'Asiento resumen de facturas'],
  ['F5', 'Importaciones (DUA)'], ['F6', 'Justificantes contables'],
  ['R1', 'Rectificativa - error fundado en derecho'], ['R2', 'Rectificativa - concurso'],
  ['R3', 'Rectificativa - crédito incobrable'], ['R4', 'Rectificativa - resto'],
  ['R5', 'Rectificativa de factura simplificada'], ['LC', 'Aduanas - liquidación complementaria'],
  ['SF', 'Asiento sin obligación de emitir factura'],
] as const);

export const AEAT_INCOME_CONCEPTS = codes([
  ['I01', 'Ingresos de explotación'], ['I02', 'Ingresos financieros por aplazamiento'],
  ['I03', 'Subvenciones corrientes'], ['I04', 'Imputación de subvenciones de capital'],
  ['I05', 'IVA devengado'], ['I06', 'Variación de existencias'], ['I07', 'Otros ingresos'],
  ['I08', 'Autoconsumo de bienes y servicios'], ['I09', 'Transmisión de elementos patrimoniales'],
] as const);

export const AEAT_EXPENSE_CONCEPTS = codes([
  ['G01', 'Compra de existencias'], ['G02', 'Variación de existencias'], ['G03', 'Otros consumos de explotación'],
  ['G04', 'Sueldos y salarios'], ['G05', 'Seguridad Social a cargo de la empresa'],
  ['G06', 'Seguridad Social y mutualidades del titular'], ['G45', 'Seguridad Social del titular'],
  ['G46', 'Mutualidades alternativas del titular'], ['G07', 'Indemnizaciones'],
  ['G08', 'Dietas y viajes del personal'], ['G09', 'Previsión social del personal'], ['G10', 'Otros gastos de personal'],
  ['G11', 'Manutención del contribuyente'], ['G12', 'Arrendamientos y cánones'], ['G13', 'Reparaciones y conservación'],
  ['GY4', 'Suministros (electricidad, agua, gas, telefonía e internet)'], ['G14', 'Suministro eléctrico'],
  ['G15', 'Suministro de agua'], ['G16', 'Suministro de gas'], ['G17', 'Telefonía e internet'], ['G18', 'Otros suministros'],
  ['G19', 'Servicios de profesionales independientes'], ['G40', 'Formalización de contratos'], ['G41', 'Defensa jurídica'],
  ['G42', 'Servicios personales de terceros'], ['G20', 'Primas de seguros'], ['G22', 'Otros servicios exteriores'],
  ['G44', 'Gastos de comunidad'], ['G23', 'Intereses de deudas'], ['G24', 'Otros gastos financieros'],
  ['G25', 'IVA soportado'], ['G26', 'Otros tributos deducibles'], ['GY8', 'Amortización del inmovilizado material'],
  ['G27', 'Amortización de edificios'], ['G28', 'Amortización de instalaciones y mobiliario'],
  ['G29', 'Amortización de maquinaria'], ['G30', 'Amortización de transporte'], ['G31', 'Amortización de equipos informáticos'],
  ['G32', 'Amortización de útiles y herramientas'], ['G33', 'Amortización de ganado y cultivos'],
  ['G38', 'Amortización del inmovilizado inmaterial'], ['G34', 'Insolvencias de deudores'],
  ['G35', 'Mecenazgo - convenios'], ['G36', 'Mecenazgo - actividades de interés general'],
  ['G43', 'Saldos de dudoso cobro'], ['G37', 'Otros conceptos fiscalmente deducibles'],
  ['G39', 'Provisiones fiscalmente deducibles'], ['G47', 'Regularización RETA a ingresar'],
  ['G48', 'Regularización RETA - devolución'],
] as const);

export const AEAT_ISSUED_OPERATION_KEYS = codes([
  ['01', 'Régimen general'], ['02', 'Exportación'], ['03', 'Bienes usados'], ['04', 'Oro de inversión'],
  ['05', 'Agencias de viajes'], ['06', 'Grupo de entidades'], ['07', 'Criterio de caja'], ['08', 'IPSI / IGIC'],
  ['09', 'Servicios de agencias de viaje'], ['10', 'Cobros por cuenta de terceros'], ['11', 'Arrendamiento con retención'],
  ['12', 'Arrendamiento sin retención'], ['13', 'Arrendamiento mixto'], ['14', 'IVA pendiente - AAPP'],
  ['15', 'IVA pendiente - tracto sucesivo'], ['17', 'OSS e IOSS'], ['18', 'Recargo de equivalencia'], ['19', 'REAGYP'],
] as const);

export const AEAT_RECEIVED_OPERATION_KEYS = codes([
  ['01', 'Régimen general'], ['02', 'Compensaciones REAGYP'], ['03', 'Bienes usados'], ['04', 'Oro de inversión'],
  ['05', 'Agencias de viajes'], ['06', 'Grupo de entidades'], ['07', 'Criterio de caja'], ['08', 'IPSI / IGIC'],
  ['09', 'Adquisición intracomunitaria'], ['12', 'Arrendamiento'], ['13', 'Importación sin DUA'],
  ['18', 'Recargo de equivalencia'], ['19', 'REAGYP'],
] as const);

export const AEAT_OPERATION_QUALIFICATIONS = codes([
  ['S1', 'Sujeta y no exenta - sin inversión'], ['S2', 'Sujeta y no exenta - con inversión'],
  ['N1', 'No sujeta por artículos 7, 14 u otros'], ['N2', 'No sujeta por reglas de localización'],
] as const);
export const AEAT_EXEMPTION_CODES = codes([
  ['E1', 'Exenta por el artículo 20'], ['E2', 'Exenta por el artículo 21'], ['E3', 'Exenta por el artículo 22'],
  ['E4', 'Exenta por los artículos 23 y 24'], ['E5', 'Exenta por el artículo 25'], ['E6', 'Exenta por otros motivos'],
] as const);
export const AEAT_NIF_TYPES = codes([
  ['01', 'NIF/NIE'], ['02', 'NIF-IVA intracomunitario'], ['03', 'Pasaporte'],
  ['04', 'Documento oficial del país de residencia'], ['05', 'Certificado de residencia'], ['06', 'Otro documento probatorio'],
] as const);
export const AEAT_PAYMENT_METHODS = codes([
  ['01', 'Transferencia'], ['02', 'Cheque'], ['03', 'No se cobra'], ['04', 'Otros medios'], ['05', 'Domiciliación bancaria'],
] as const);
export const AEAT_VAT_RATES = [21, 10, 4, 0, 2, 5, 7.5, 10.5, 12] as const;

export const aeatCodeSet = (items: readonly AeatCode[]) => new Set(items.map((item) => item.code));
