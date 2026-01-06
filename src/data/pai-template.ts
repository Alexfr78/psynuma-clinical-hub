/**
 * PAI - Inventario de Evaluación de la Personalidad
 * Adaptación española © TEA Ediciones
 */

export interface PAIItem {
  index: number;
  text: string;
  reversed?: boolean;
}

export interface PAIScale {
  code: string;
  label: string;
  description: string;
  items: number[];
  subscales?: Record<string, { label: string; items: number[] }>;
}

export interface PAITemplate {
  code: string;
  name: string;
  description: string;
  version: number;
  response_min: number;
  response_max: number;
  min_label: string;
  max_label: string;
  labels: string[];
  items: PAIItem[];
  validityScales: PAIScale[];
  clinicalScales: PAIScale[];
  treatmentScales: PAIScale[];
  interpersonalScales: PAIScale[];
  scoring: Record<string, { items: number[]; label: string; description?: string }>;
  instructions: string;
  flag_threshold: number;
  chart_full_mark: number;
}

// Escalas de validez
const VALIDITY_SCALES: PAIScale[] = [
  { code: 'INC', label: 'Inconsistencia', description: 'Respuestas inconsistentes', items: [] },
  { code: 'INF', label: 'Infrecuencia', description: 'Respuestas atípicas', items: [16, 55, 89, 120, 152, 186, 218, 251] },
  { code: 'IMN', label: 'Impresión Negativa', description: 'Exageración de síntomas', items: [23, 56, 90, 121, 153, 187, 219, 252, 282] },
  { code: 'IMP', label: 'Impresión Positiva', description: 'Imagen favorable', items: [10, 44, 78, 112, 145, 179, 211, 244, 277] },
];

// Escalas clínicas
const CLINICAL_SCALES: PAIScale[] = [
  { code: 'SOM', label: 'Quejas Somáticas', description: 'Síntomas físicos', items: [1, 35, 69, 103, 136, 170, 202, 235, 268, 299, 323, 2, 36, 70, 104, 137, 171, 203, 236, 269, 300, 324, 3, 37], subscales: { 'SOM-C': { label: 'Conversión', items: [1, 35, 69, 103, 136, 170, 202, 235] }, 'SOM-S': { label: 'Somatización', items: [268, 299, 323, 2, 36, 70, 104, 137] }, 'SOM-H': { label: 'Hipocondría', items: [171, 203, 236, 269, 300, 324, 3, 37] } } },
  { code: 'ANX', label: 'Ansiedad', description: 'Síntomas de ansiedad', items: [4, 38, 72, 106, 139, 173, 205, 238, 271, 301, 325, 5, 39, 73, 107, 140, 174, 206, 239, 272, 302, 326, 6, 40], subscales: { 'ANX-C': { label: 'Cognitiva', items: [4, 38, 72, 106, 139, 173, 205, 238] }, 'ANX-A': { label: 'Afectiva', items: [271, 301, 325, 5, 39, 73, 107, 140] }, 'ANX-P': { label: 'Fisiológica', items: [174, 206, 239, 272, 302, 326, 6, 40] } } },
  { code: 'ARD', label: 'Trast. Rel. Ansiedad', description: 'Fobias, trauma, TOC', items: [7, 41, 75, 109, 142, 176, 208, 241, 274, 303, 327, 8, 42, 76, 110, 143, 177, 209, 242, 275, 304, 328, 9, 43], subscales: { 'ARD-O': { label: 'Obsesivo-Compulsivo', items: [7, 41, 75, 109, 142, 176, 208, 241] }, 'ARD-P': { label: 'Fobias', items: [274, 303, 327, 8, 42, 76, 110, 143] }, 'ARD-T': { label: 'Estrés Traumático', items: [177, 209, 242, 275, 304, 328, 9, 43] } } },
  { code: 'DEP', label: 'Depresión', description: 'Síntomas depresivos', items: [11, 45, 79, 113, 146, 180, 212, 245, 278, 305, 329, 12, 46, 80, 114, 147, 181, 213, 246, 279, 306, 330, 13, 47], subscales: { 'DEP-C': { label: 'Cognitiva', items: [11, 45, 79, 113, 146, 180, 212, 245] }, 'DEP-A': { label: 'Afectiva', items: [278, 305, 329, 12, 46, 80, 114, 147] }, 'DEP-P': { label: 'Fisiológica', items: [181, 213, 246, 279, 306, 330, 13, 47] } } },
  { code: 'MAN', label: 'Manía', description: 'Síntomas maníacos', items: [14, 48, 82, 116, 149, 183, 215, 248, 280, 307, 331, 15, 49, 83, 117, 150, 184, 216, 249, 281, 308, 332, 17, 51], subscales: { 'MAN-A': { label: 'Nivel de Actividad', items: [14, 48, 82, 116, 149, 183, 215, 248] }, 'MAN-G': { label: 'Grandiosidad', items: [280, 307, 331, 15, 49, 83, 117, 150] }, 'MAN-I': { label: 'Irritabilidad', items: [184, 216, 249, 281, 308, 332, 17, 51] } } },
  { code: 'PAR', label: 'Paranoia', description: 'Suspicacia y desconfianza', items: [18, 52, 86, 118, 151, 185, 217, 250, 283, 309, 333, 19, 53, 87, 119, 154, 188, 220, 253, 284, 310, 334, 20, 54], subscales: { 'PAR-H': { label: 'Hipervigilancia', items: [18, 52, 86, 118, 151, 185, 217, 250] }, 'PAR-P': { label: 'Persecución', items: [283, 309, 333, 19, 53, 87, 119, 154] }, 'PAR-R': { label: 'Resentimiento', items: [188, 220, 253, 284, 310, 334, 20, 54] } } },
  { code: 'SCZ', label: 'Esquizofrenia', description: 'Síntomas psicóticos', items: [21, 57, 91, 122, 155, 189, 221, 254, 285, 311, 335, 22, 58, 92, 123, 156, 190, 222, 255, 286, 312, 336, 24, 59], subscales: { 'SCZ-P': { label: 'Experiencias Psicóticas', items: [21, 57, 91, 122, 155, 189, 221, 254] }, 'SCZ-S': { label: 'Aislamiento Social', items: [285, 311, 335, 22, 58, 92, 123, 156] }, 'SCZ-T': { label: 'Trastorno del Pensamiento', items: [190, 222, 255, 286, 312, 336, 24, 59] } } },
  { code: 'BOR', label: 'Rasgos Límite', description: 'Inestabilidad e impulsividad', items: [25, 60, 93, 124, 157, 191, 223, 256, 287, 313, 337, 26, 61, 94, 125, 158, 192, 224, 257, 288, 314, 338, 27, 62], subscales: { 'BOR-A': { label: 'Inestabilidad Afectiva', items: [25, 60, 93, 124, 157, 191, 223, 256] }, 'BOR-I': { label: 'Problemas de Identidad', items: [287, 313, 337, 26, 61, 94, 125, 158] }, 'BOR-N': { label: 'Relaciones Negativas', items: [192, 224, 257, 288, 314, 338, 27, 62] }, 'BOR-S': { label: 'Autolesiones', items: [95, 126, 159, 193, 225, 258, 289, 315] } } },
  { code: 'ANT', label: 'Rasgos Antisociales', description: 'Conducta antisocial', items: [28, 63, 96, 127, 160, 194, 226, 259, 290, 316, 339, 29, 64, 97, 128, 161, 195, 227, 260, 291, 317, 340, 30, 65], subscales: { 'ANT-A': { label: 'Conductas Antisociales', items: [28, 63, 96, 127, 160, 194, 226, 259] }, 'ANT-E': { label: 'Egocentrismo', items: [290, 316, 339, 29, 64, 97, 128, 161] }, 'ANT-S': { label: 'Búsqueda de Sensaciones', items: [195, 227, 260, 291, 317, 340, 30, 65] } } },
  { code: 'ALC', label: 'Problemas Alcohol', description: 'Consumo problemático', items: [31, 66, 98, 129, 162, 196, 228, 261, 292, 318, 341, 32, 67] },
  { code: 'DRG', label: 'Problemas Drogas', description: 'Consumo de sustancias', items: [33, 68, 99, 130, 163, 197, 229, 262, 293, 319, 342, 34, 71] },
];

// Escalas de tratamiento
const TREATMENT_SCALES: PAIScale[] = [
  { code: 'AGG', label: 'Agresión', description: 'Potencial agresivo', items: [74, 108, 141, 175, 207, 240, 273, 298, 322, 77, 111, 144, 178, 210, 243, 276, 297, 321, 81, 115], subscales: { 'AGG-A': { label: 'Actitud Agresiva', items: [74, 108, 141, 175, 207, 240, 273] }, 'AGG-V': { label: 'Agresión Verbal', items: [298, 322, 77, 111, 144, 178, 210] }, 'AGG-P': { label: 'Agresión Física', items: [243, 276, 297, 321, 81, 115] } } },
  { code: 'SUI', label: 'Ideación Suicida', description: 'Pensamientos suicidas', items: [84, 85, 132, 133, 164, 165, 198, 199, 230, 231, 263, 264] },
  { code: 'STR', label: 'Estrés', description: 'Nivel de estrés', items: [100, 101, 134, 135, 166, 167, 200, 201, 232, 233, 265, 266] },
  { code: 'NON', label: 'Falta Apoyo', description: 'Aislamiento social', items: [102, 138, 168, 169, 234, 267, 294, 295, 296, 320, 343, 344] },
  { code: 'RXR', label: 'Rechazo Tratamiento', description: 'Resistencia al cambio', items: [50, 88, 131, 148, 182, 214, 247, 270] },
];

// Escalas interpersonales
const INTERPERSONAL_SCALES: PAIScale[] = [
  { code: 'DOM', label: 'Dominancia', description: 'Tendencia a dominar', items: [105, 172, 204, 237, 269, 300, 324, 339, 340, 341, 342, 343] },
  { code: 'WRM', label: 'Afabilidad', description: 'Calidez interpersonal', items: [106, 173, 205, 238, 271, 301, 325, 326, 327, 328, 329, 330] },
];

// 344 ítems oficiales del PAI (Adaptación española - TEA Ediciones)
const PAI_ITEMS: PAIItem[] = [
  { index: 1, text: "Mis amigos están disponibles cuando los necesito." },
  { index: 2, text: "En ciertas ocasiones me gustaría estar muerto." },
  { index: 3, text: "Tengo algunos conflictos internos que me causan problemas." },
  { index: 4, text: "La gente tiene miedo de mi temperamento." },
  { index: 5, text: "A veces tomo drogas para sentirme mejor." },
  { index: 6, text: "He probado casi todos los tipos de drogas." },
  { index: 7, text: "En algunas ocasiones siento tanta tensión que me cuesta mucho soportarlo." },
  { index: 8, text: "A veces incluso las cosas pequeñas me preocupan demasiado." },
  { index: 9, text: "Soy una persona con mucha energía." },
  { index: 10, text: "Me siento nervioso/a cuando tengo que salir de mi casa." },
  { index: 11, text: "A menudo me duele el estómago." },
  { index: 12, text: "Pierdo los estribos y me meto en peleas." },
  { index: 13, text: "Hay épocas en las que estoy muy contento sin ninguna razón especial." },
  { index: 14, text: "Hago cosas impulsivamente de las cuales luego me arrepiento." },
  { index: 15, text: "Cuando era niño/a cometí pequeños robos." },
  { index: 16, text: "El alcohol me ha causado problemas." },
  { index: 17, text: "Me siento lleno de energía, a pesar de que duermo poco." },
  { index: 18, text: "A menudo me descubro soñando despierto durante el día." },
  { index: 19, text: "Tengo pocos intereses." },
  { index: 20, text: "No me importa si alguien me toma el pelo." },
  { index: 21, text: "Estoy satisfecho con mis relaciones." },
  { index: 22, text: "Tengo muy buena suerte en mis inversiones." },
  { index: 23, text: "Veo las cosas de manera diferente que otras personas." },
  { index: 24, text: "Me gusta ser el centro de atención." },
  { index: 25, text: "No me considero una persona competente." },
  { index: 26, text: "Apenas tengo ningún buen amigo." },
  { index: 27, text: "He pensado en maneras de terminar con mi vida." },
  { index: 28, text: "En los últimos años he notado muchas pérdidas de memoria." },
  { index: 29, text: "Generalmente, no me importa si hago daño a la gente." },
  { index: 30, text: "Disfruto con las drogas." },
  { index: 31, text: "Me resulta casi imposible dejar de tomar drogas ilegales." },
  { index: 32, text: "Siento tanta ansiedad que me cuesta concentrarme." },
  { index: 33, text: "Me preocupa mucho parecer estúpido/a delante de los demás." },
  { index: 34, text: "Me resulta difícil organizar mi trabajo." },
  { index: 35, text: "Noto que me están observando cuando estoy en público." },
  { index: 36, text: "A menudo tengo entumecimiento o sensación de hormigueo." },
  { index: 37, text: "Tengo tan malas pulgas que la gente procura quitarse de en medio." },
  { index: 38, text: "A veces me siento eufórico/a." },
  { index: 39, text: "Mis emociones cambian de repente." },
  { index: 40, text: "Cuando era joven, era algo delincuente." },
  { index: 41, text: "Pierdo el control cuando bebo." },
  { index: 42, text: "Me siento agotado/a cuando me despierto por la mañana." },
  { index: 43, text: "Me resulta difícil pensar." },
  { index: 44, text: "Estoy triste por algo que ocurrió hace tiempo." },
  { index: 45, text: "Normalmente intento evitar enfrentamientos." },
  { index: 46, text: "En el pasado me era muy difícil dejar de beber." },
  { index: 47, text: "He tenido alucinaciones." },
  { index: 48, text: "Me gusta tomar mis propias decisiones, sin el consejo de otros." },
  { index: 49, text: "Me resulta difícil empezar a hacer las cosas." },
  { index: 50, text: "Los demás me apoyan cuando les necesito." },
  { index: 51, text: "Recientemente he pensado con seriedad en el suicidio." },
  { index: 52, text: "Creo que nada malo podrá ocurrirme." },
  { index: 53, text: "He lastimado a personas cercanas a mí." },
  { index: 54, text: "Después de tomar drogas me he encontrado mal." },
  { index: 55, text: "Me costaría mucho dejar las drogas." },
  { index: 56, text: "A menudo tengo la sensación de que va a ocurrir algo terrible." },
  { index: 57, text: "Tengo miedo de ponerme nervioso/a estando con mucha gente." },
  { index: 58, text: "Me ha ocurrido algo que me ha cambiado la vida, que nunca he podido superar." },
  { index: 59, text: "Tiendo a pensar que la gente me ignora o me rechaza." },
  { index: 60, text: "Tengo mala salud." },
  { index: 61, text: "Muchas veces pierdo los estribos." },
  { index: 62, text: "No necesito tanta ayuda como la gente piensa que necesito." },
  { index: 63, text: "Mi vida es aburrida." },
  { index: 64, text: "He sido irresponsable como padre o como empleado." },
  { index: 65, text: "Con frecuencia, el alcohol me quita las penas." },
  { index: 66, text: "Pienso en algunas cosas que son demasiado malas como para hablar de ellas." },
  { index: 67, text: "Tengo ideas tan buenas que nadie puede detenerme." },
  { index: 68, text: "La gente desaprueba mis ideas radicales." },
  { index: 69, text: "Me resulta difícil entablar una buena amistad." },
  { index: 70, text: "Nadie puede cambiarme." },
  { index: 71, text: "Todos tenemos problemas, pero el mío es especialmente difícil." },
  { index: 72, text: "Los demás desean hacerme daño." },
  { index: 73, text: "Disfruto mucho los juegos de azar." },
  { index: 74, text: "Me gusta que otras personas tomen decisiones por mí." },
  { index: 75, text: "Muchas veces estoy nervioso/a." },
  { index: 76, text: "Me es posible conseguir lo que quiero." },
  { index: 77, text: "Algunas veces he pensado en terminar con mi vida." },
  { index: 78, text: "A veces me siento muy bien por cualquier cosa." },
  { index: 79, text: "Me gusta divertirme a cualquier precio." },
  { index: 80, text: "He hecho cosas ilegales a menudo." },
  { index: 81, text: "Me han dicho que tengo problemas con el alcohol." },
  { index: 82, text: "Tengo ideas raras que los demás no comparten." },
  { index: 83, text: "Cuando tengo un problema, casi nadie me ayuda." },
  { index: 84, text: "Hablo de mis problemas con los demás." },
  { index: 85, text: "Me da miedo volverme loco/a." },
  { index: 86, text: "Algunas experiencias que he tenido me han afectado durante años." },
  { index: 87, text: "No estoy contento/a con mi vida actual." },
  { index: 88, text: "Creo que la gente habla de mí." },
  { index: 89, text: "A menudo siento un dolor muy fuerte." },
  { index: 90, text: "Me enojo fácilmente." },
  { index: 91, text: "Necesito dormir muy poco para sentirme descansado/a." },
  { index: 92, text: "Me gusta relacionarme con otras personas." },
  { index: 93, text: "Utilizo a las personas que me rodean." },
  { index: 94, text: "Me cuesta mucho dejar el alcohol." },
  { index: 95, text: "Me cuesta mucho concentrarme." },
  { index: 96, text: "Tengo dificultades para controlar mi ira." },
  { index: 97, text: "No soy una persona que haga amistad fácilmente." },
  { index: 98, text: "Terminaría con mi vida si tuviera el valor." },
  { index: 99, text: "Tengo cambios de ánimo." },
  { index: 100, text: "Me siento estupendamente." },
  { index: 101, text: "Tengo relaciones tormentosas." },
  { index: 102, text: "La gente me mira fijamente." },
  { index: 103, text: "Las drogas me han causado problemas." },
  { index: 104, text: "Tengo miedo a los espacios cerrados." },
  { index: 105, text: "Me siento triste o deprimido/a la mayor parte del tiempo." },
  { index: 106, text: "Estoy orgulloso/a de la confianza que me tienen." },
  { index: 107, text: "Necesito el alcohol para relajarme." },
  { index: 108, text: "Por la noche, a menudo me despierto." },
  { index: 109, text: "Oigo cosas que otros no pueden oír." },
  { index: 110, text: "Alguien me ha hecho cosas imperdonables." },
  { index: 111, text: "Me siento inseguro/a incluso en casa." },
  { index: 112, text: "A veces tengo la sensación de que me siguen." },
  { index: 113, text: "Me preocupo mucho." },
  { index: 114, text: "Me duele la cabeza a menudo." },
  { index: 115, text: "La gente me dice que levanto la voz cuando discuto." },
  { index: 116, text: "Probablemente tengo más ideas que la mayoría de la gente." },
  { index: 117, text: "Me siento solo/a incluso cuando estoy con otras personas." },
  { index: 118, text: "Soy muy hábil manipulando a la gente." },
  { index: 119, text: "Algunas veces tomo seis o más bebidas alcohólicas al día." },
  { index: 120, text: "Cuando estoy muy enfadado/a, a veces doy golpes a alguien." },
  { index: 121, text: "Veo cosas que otras personas no pueden ver." },
  { index: 122, text: "Me siento incómodo/a en público." },
  { index: 123, text: "Creo que voy a perder la cabeza." },
  { index: 124, text: "Si me tratan mal, reacciono." },
  { index: 125, text: "Mis nervios están destrozados." },
  { index: 126, text: "Mi familia y amigos me ayudarían si lo necesitara." },
  { index: 127, text: "Hago planes para suicidarme." },
  { index: 128, text: "No estoy seguro/a de saber quién soy." },
  { index: 129, text: "A veces mis pensamientos pasan tan rápido que no puedo seguirlos." },
  { index: 130, text: "Me siento más importante que la mayoría de la gente." },
  { index: 131, text: "Me aburro fácilmente." },
  { index: 132, text: "Muchas veces bebo más de lo que pretendía." },
  { index: 133, text: "Me siento muy inferior a los demás." },
  { index: 134, text: "No tengo fuerza de voluntad." },
  { index: 135, text: "Desconfío de la gente amable." },
  { index: 136, text: "Estoy pasando una temporada difícil." },
  { index: 137, text: "Me siento decepcionado/a con mi vida." },
  { index: 138, text: "Estoy tan susceptible que la gente tiene miedo de hacerme enojar." },
  { index: 139, text: "Es difícil seguir mis pensamientos." },
  { index: 140, text: "Siempre se puede confiar en mí." },
  { index: 141, text: "Me siento muy seguro/a de mí mismo/a." },
  { index: 142, text: "Me cuesta concentrarme debido a pensamientos que no deseaba." },
  { index: 143, text: "Me gusta salir a divertirme." },
  { index: 144, text: "He tenido problemas en el trabajo por culpa del alcohol." },
  { index: 145, text: "Creo que mucha gente es falsa o hipócrita." },
  { index: 146, text: "Mantengo mis emociones para mí." },
  { index: 147, text: "Tengo miedo a las multitudes." },
  { index: 148, text: "Soy propenso/a a los accidentes." },
  { index: 149, text: "Me siento desesperanzado/a respecto al futuro." },
  { index: 150, text: "Nadie entiende mis problemas." },
  { index: 151, text: "No me llevo bien con la mayoría de la gente." },
  { index: 152, text: "Podría tener más éxito si la gente no me pusiera obstáculos." },
  { index: 153, text: "Bebo demasiado." },
  { index: 154, text: "La gente puede oír lo que pienso." },
  { index: 155, text: "Cuando es necesario, soy una persona asertiva." },
  { index: 156, text: "Tengo pensamientos que no puedo sacar de mi cabeza." },
  { index: 157, text: "Soy una persona tímida." },
  { index: 158, text: "A veces me siento tan vacío/a que me gustaría desaparecer." },
  { index: 159, text: "A la gente le resulta agradable estar conmigo." },
  { index: 160, text: "Mis ideas son demasiado avanzadas para la época." },
  { index: 161, text: "A veces siento que nada vale la pena." },
  { index: 162, text: "Hay épocas en las que me siento fuera de control." },
  { index: 163, text: "El alcohol me ayuda a dormir." },
  { index: 164, text: "Hay gente que intenta hacerme daño." },
  { index: 165, text: "Creo que mi familia me quiere." },
  { index: 166, text: "Me pongo tenso/a cuando pienso en mis problemas." },
  { index: 167, text: "Tengo dificultades para respirar." },
  { index: 168, text: "Cuando me enfado mucho, suelo romper cosas." },
  { index: 169, text: "Tengo muy poca energía." },
  { index: 170, text: "A menudo me siento inquieto/a." },
  { index: 171, text: "Aunque lo intente, no puedo evitar meterme en problemas." },
  { index: 172, text: "Me cuesta mucho pensar." },
  { index: 173, text: "Mis relaciones personales duran mucho." },
  { index: 174, text: "Estoy contento/a con la persona que soy." },
  { index: 175, text: "Cuando bebo, hago cosas de las que me arrepiento." },
  { index: 176, text: "Mi memoria ha empeorado." },
  { index: 177, text: "Alguien quiere controlar mis pensamientos." },
  { index: 178, text: "A menudo me siento extraño o irreal." },
  { index: 179, text: "A veces siento las manos tan rígidas que no puedo escribir bien." },
  { index: 180, text: "Cuando estoy deprimido/a, me cuesta hacer las cosas." },
  { index: 181, text: "Tengo tantos problemas que no sé qué hacer." },
  { index: 182, text: "Me gusta cuando una relación se vuelve más intensa." },
  { index: 183, text: "He hecho algunas cosas ilegales." },
  { index: 184, text: "El alcohol es lo primero en lo que pienso cuando tengo un problema." },
  { index: 185, text: "Hay mucha gente que intenta aprovecharse de mí." },
  { index: 186, text: "Con frecuencia me siento incómodo/a con la gente." },
  { index: 187, text: "A menudo me siento tan tenso que me cuesta relajarme." },
  { index: 188, text: "A veces tengo problemas para respirar." },
  { index: 189, text: "A veces me irrito tanto que podría hacer daño a alguien." },
  { index: 190, text: "Paso mucho tiempo solo/a." },
  { index: 191, text: "Las cosas van muy bien en mi vida." },
  { index: 192, text: "Cuando era joven, cometí delitos pequeños." },
  { index: 193, text: "Tengo cuidado para evitar la ansiedad." },
  { index: 194, text: "A menudo pierdo la noción del tiempo." },
  { index: 195, text: "Me gustaría estar muerto." },
  { index: 196, text: "Tengo sentimientos de culpa que no puedo explicar." },
  { index: 197, text: "Hay situaciones en las que me siento nervioso/a en público." },
  { index: 198, text: "A menudo me siento paralizado/a por el miedo." },
  { index: 199, text: "Puedo pasar de estar triste a estar contento/a en segundos." },
  { index: 200, text: "Me cuesta controlar mis impulsos." },
  { index: 201, text: "Hace tiempo que no bebo alcohol." },
  { index: 202, text: "Me siento muy estresado/a." },
  { index: 203, text: "Tengo una misión especial que cumplir." },
  { index: 204, text: "A veces la gente piensa que soy extraño/a o raro/a." },
  { index: 205, text: "No tengo ningún problema importante." },
  { index: 206, text: "Tengo un problema de bebida." },
  { index: 207, text: "He pensado cómo me suicidaría." },
  { index: 208, text: "Me siento especial o diferente." },
  { index: 209, text: "Creo que puedo leer la mente de otras personas." },
  { index: 210, text: "Con frecuencia me siento deprimido/a por las mañanas." },
  { index: 211, text: "Mis padres me hicieron sentir querido/a." },
  { index: 212, text: "Me gustaría tener más control sobre mi vida." },
  { index: 213, text: "A menudo siento dolor en el pecho." },
  { index: 214, text: "La mayoría de la gente me defrauda." },
  { index: 215, text: "A veces puedo hacer que la gente haga lo que yo quiero." },
  { index: 216, text: "Hay momentos en los que soy muy activo/a." },
  { index: 217, text: "Controlo las drogas, ellas no me controlan a mí." },
  { index: 218, text: "Me va mejor solo/a." },
  { index: 219, text: "Me gusta asustarme con películas de terror." },
  { index: 220, text: "Me siento ansioso/a ante la posibilidad de que algo malo vaya a ocurrir." },
  { index: 221, text: "Me asusto si una puerta se cierra de golpe." },
  { index: 222, text: "Algunas veces me siento tan nervioso/a que me mareo." },
  { index: 223, text: "Hay épocas en las que no me importa nada." },
  { index: 224, text: "Me siento cómodo/a cuando conozco gente nueva." },
  { index: 225, text: "Mi familia es leal a mí." },
  { index: 226, text: "He intentado suicidarme." },
  { index: 227, text: "Mi vida ha sido muy interesante." },
  { index: 228, text: "Mucha gente me tiene envidia." },
  { index: 229, text: "Me cuesta pensar con claridad." },
  { index: 230, text: "Tengo una enfermedad que los médicos no han podido diagnosticar." },
  { index: 231, text: "No me importa mentir." },
  { index: 232, text: "A la mayoría de la gente le gusto." },
  { index: 233, text: "Me preocupo demasiado por cosas sin importancia." },
  { index: 234, text: "A veces siento que me están vigilando." },
  { index: 235, text: "Me siento muy decepcionado/a con mis relaciones amorosas." },
  { index: 236, text: "Me irrito fácilmente." },
  { index: 237, text: "A veces hablo tan rápido que la gente no me entiende." },
  { index: 238, text: "Mis amigos son más importantes que mi familia." },
  { index: 239, text: "Prefiero seguir a los demás." },
  { index: 240, text: "Algunas veces me despierto empapado/a de sudor." },
  { index: 241, text: "Tengo algunos problemas con las drogas." },
  { index: 242, text: "A veces me olvido de lo que iba a decir." },
  { index: 243, text: "Soy incapaz de tomar decisiones." },
  { index: 244, text: "Nunca me siento deprimido/a." },
  { index: 245, text: "Casi todos mis amigos me tienen cariño." },
  { index: 246, text: "Hay personas que intentan robarme mis ideas." },
  { index: 247, text: "Me cuesta confiar en los demás." },
  { index: 248, text: "Soy mejor que la mayoría de mis compañeros de trabajo." },
  { index: 249, text: "Me siento culpable por cosas que he hecho." },
  { index: 250, text: "Me siento inferior a los demás." },
  { index: 251, text: "Tengo ideas que otras personas consideran raras." },
  { index: 252, text: "He sido despedido/a de un trabajo." },
  { index: 253, text: "A veces hablo conmigo mismo/a en voz alta." },
  { index: 254, text: "Algunas veces me dan ganas de romper cosas." },
  { index: 255, text: "Me cuesta permanecer quieto/a." },
  { index: 256, text: "Tengo muy mal genio." },
  { index: 257, text: "A menudo pienso que estoy enfermo/a." },
  { index: 258, text: "Me siento mejor cuando estoy solo/a." },
  { index: 259, text: "Con frecuencia estoy de mal humor." },
  { index: 260, text: "Me resulta difícil perdonar a los demás." },
  { index: 261, text: "Me cuesta mantener el equilibrio." },
  { index: 262, text: "Soy una persona honesta." },
  { index: 263, text: "La gente habla de mí a mis espaldas." },
  { index: 264, text: "Evito situaciones nuevas o desconocidas." },
  { index: 265, text: "Me siento atrapado/a en mi vida." },
  { index: 266, text: "Mis amigos me comprenden." },
  { index: 267, text: "Mi vida actual es estresante." },
  { index: 268, text: "Necesito más dinero del que tengo." },
  { index: 269, text: "Me resulta difícil conectar con la gente." },
  { index: 270, text: "Tengo ataques de pánico." },
  { index: 271, text: "A veces pierdo de vista mis objetivos." },
  { index: 272, text: "Me cuesta disfrutar de la vida." },
  { index: 273, text: "Consumo drogas a menudo." },
  { index: 274, text: "Algunas veces me siento muy contento/a." },
  { index: 275, text: "Creo que tengo poderes especiales." },
  { index: 276, text: "Suelo tener problemas de estómago." },
  { index: 277, text: "Me preocupo mucho por mi salud." },
  { index: 278, text: "Me resulta difícil controlar mis emociones." },
  { index: 279, text: "Tengo recuerdos dolorosos que me persiguen." },
  { index: 280, text: "Me siento desconectado/a de los demás." },
  { index: 281, text: "Me siento muy tenso/a." },
  { index: 282, text: "Paso mucho tiempo preocupándome." },
  { index: 283, text: "Me cuesta tomar la iniciativa." },
  { index: 284, text: "A veces mis pensamientos me asustan." },
  { index: 285, text: "Me gusta experimentar cosas nuevas." },
  { index: 286, text: "Me siento inseguro/a sobre mi futuro." },
  { index: 287, text: "Creo que estoy perdiendo el juicio." },
  { index: 288, text: "A veces me siento muy agresivo/a." },
  { index: 289, text: "Tengo dificultad para confiar en la gente." },
  { index: 290, text: "Soy una persona exitosa." },
  { index: 291, text: "Me siento vacío/a por dentro." },
  { index: 292, text: "A menudo pienso en la muerte." },
  { index: 293, text: "Me he sentido muy mal después de consumir drogas." },
  { index: 294, text: "Creo que soy especial." },
  { index: 295, text: "Nadie me escucha." },
  { index: 296, text: "Me siento cansado/a la mayor parte del tiempo." },
  { index: 297, text: "Tengo pesadillas frecuentemente." },
  { index: 298, text: "Soy muy impaciente." },
  { index: 299, text: "La gente me decepciona constantemente." },
  { index: 300, text: "Me siento nervioso/a con frecuencia." },
  { index: 301, text: "A veces me siento fuera de control." },
  { index: 302, text: "Tomo decisiones rápidamente." },
  { index: 303, text: "Me cuesta dormir por las noches." },
  { index: 304, text: "Me irritan los pequeños detalles." },
  { index: 305, text: "A menudo me siento culpable." },
  { index: 306, text: "Prefiero estar con otras personas." },
  { index: 307, text: "Me siento seguro/a de mis capacidades." },
  { index: 308, text: "Tengo una actitud positiva ante la vida." },
  { index: 309, text: "Me siento físicamente enfermo/a a menudo." },
  { index: 310, text: "Me preocupo demasiado por lo que piensan los demás." },
  { index: 311, text: "Tengo pesadillas sobre cosas que me han pasado." },
  { index: 312, text: "Me siento triste sin razón aparente." },
  { index: 313, text: "Me resulta difícil permanecer quieto/a." },
  { index: 314, text: "La gente me considera una persona hostil." },
  { index: 315, text: "Prefiero estar solo/a." },
  { index: 316, text: "No sé quién soy realmente." },
  { index: 317, text: "Me aprovecho de los demás cuando puedo." },
  { index: 318, text: "El alcohol ha afectado mi trabajo." },
  { index: 319, text: "He probado muchas drogas diferentes." },
  { index: 320, text: "Me enfurezco cuando las cosas no salen como quiero." },
  { index: 321, text: "Las cosas pequeñas me molestan mucho." },
  { index: 322, text: "Siento que no tengo ningún problema." },
  { index: 323, text: "Siempre me comporto correctamente." },
  { index: 324, text: "Me preocupa constantemente mi salud." },
  { index: 325, text: "A veces mi corazón late muy rápido sin razón." },
  { index: 326, text: "Revivo experiencias dolorosas una y otra vez." },
  { index: 327, text: "Me cuesta levantarme por las mañanas." },
  { index: 328, text: "Me irrito mucho cuando me interrumpen." },
  { index: 329, text: "Guardo rencor durante mucho tiempo." },
  { index: 330, text: "A veces mis pensamientos están confusos." },
  { index: 331, text: "Mis relaciones suelen terminar mal." },
  { index: 332, text: "Me gusta correr riesgos." },
  { index: 333, text: "Bebo alcohol todos los días." },
  { index: 334, text: "He tomado drogas regularmente." },
  { index: 335, text: "Tengo ganas de golpear a alguien." },
  { index: 336, text: "Puedo recibir mensajes especiales de la televisión o la radio." },
  { index: 337, text: "Nunca me he sentido mejor." },
  { index: 338, text: "Creo que mis problemas no tienen solución." },
  { index: 339, text: "Nunca he hecho nada malo." },
  { index: 340, text: "Me desmayo o pierdo el conocimiento a veces." },
  { index: 341, text: "Me siento muy ansioso/a en situaciones sociales." },
  { index: 342, text: "Tengo pensamientos repetitivos que no puedo controlar." },
  { index: 343, text: "Me siento sin esperanza." },
  { index: 344, text: "La relación con mi pareja no va bien." }
];

// Función para obtener scoring
export function getPAIScoring(): Record<string, { items: number[]; label: string; description?: string }> {
  const scoring: Record<string, { items: number[]; label: string; description?: string }> = {};
  [...VALIDITY_SCALES, ...CLINICAL_SCALES, ...TREATMENT_SCALES, ...INTERPERSONAL_SCALES].forEach(scale => {
    if (scale.items.length > 0) {
      scoring[scale.code] = { items: scale.items, label: scale.label, description: scale.description };
    }
    if (scale.subscales) {
      Object.entries(scale.subscales).forEach(([subCode, sub]) => {
        scoring[subCode] = { items: sub.items, label: sub.label };
      });
    }
  });
  return scoring;
}

// Template completo
export const PAI_TEMPLATE: PAITemplate = {
  code: 'PAI_V1',
  name: 'Inventario de Evaluación de la Personalidad (PAI)',
  description: 'Evaluación multidimensional de la personalidad y psicopatología para adultos. 4 escalas de validez, 11 clínicas, 5 de tratamiento y 2 interpersonales.',
  version: 1,
  response_min: 1,
  response_max: 4,
  min_label: 'Falso',
  max_label: 'Completamente Verdadero',
  labels: ['Falso', 'Ligeramente Verdadero', 'Bastante Verdadero', 'Completamente Verdadero'],
  flag_threshold: 65,
  chart_full_mark: 100,
  items: PAI_ITEMS,
  validityScales: VALIDITY_SCALES,
  clinicalScales: CLINICAL_SCALES,
  treatmentScales: TREATMENT_SCALES,
  interpersonalScales: INTERPERSONAL_SCALES,
  scoring: getPAIScoring(),
  instructions: `A continuación encontrará una serie de afirmaciones. Lea cada una de ellas y decida en qué medida describe su forma de ser, sus pensamientos, sentimientos y actitudes.

Para ello, marque una de las siguientes opciones:
• F = FALSO, nada cierto
• LV = LIGERAMENTE VERDADERO
• BV = BASTANTE VERDADERO
• CV = COMPLETAMENTE VERDADERO

Recuerde que al contestar las frases del cuestionario debe dar su propia opinión. Trate de ser sincero consigo mismo y use su propio criterio. Procure contestar a todas las frases, sin dejar ninguna en blanco.

Este cuestionario tardará aproximadamente 45-60 minutos en completarse.`
};

export const PAI_SCALE_ORDER = {
  validity: ['INC', 'INF', 'IMN', 'IMP'],
  clinical: ['SOM', 'ANX', 'ARD', 'DEP', 'MAN', 'PAR', 'SCZ', 'BOR', 'ANT', 'ALC', 'DRG'],
  treatment: ['AGG', 'SUI', 'STR', 'NON', 'RXR'],
  interpersonal: ['DOM', 'WRM'],
};

export const PAI_THRESHOLDS = {
  normal: { min: 0, max: 59, label: 'Normal', color: 'hsl(var(--chart-2))' },
  moderate: { min: 60, max: 69, label: 'Moderado', color: 'hsl(var(--chart-3))' },
  elevated: { min: 70, max: 79, label: 'Elevado', color: 'hsl(var(--chart-4))' },
  marked: { min: 80, max: 100, label: 'Muy elevado', color: 'hsl(var(--chart-5))' },
};

export const PAI_T_CONVERSION = { mean: 50, sd: 10 };

export const PAI_SCALE_LABELS: Record<string, { label: string; description: string }> = {
  INC: { label: 'Inconsistencia', description: 'Respuestas inconsistentes' },
  INF: { label: 'Infrecuencia', description: 'Respuestas atípicas' },
  IMN: { label: 'Impresión Negativa', description: 'Exageración de síntomas' },
  IMP: { label: 'Impresión Positiva', description: 'Imagen favorable' },
  SOM: { label: 'Quejas Somáticas', description: 'Síntomas físicos' },
  ANX: { label: 'Ansiedad', description: 'Síntomas de ansiedad' },
  ARD: { label: 'Trast. Rel. Ansiedad', description: 'Fobias, trauma, TOC' },
  DEP: { label: 'Depresión', description: 'Síntomas depresivos' },
  MAN: { label: 'Manía', description: 'Síntomas maníacos' },
  PAR: { label: 'Paranoia', description: 'Suspicacia y desconfianza' },
  SCZ: { label: 'Esquizofrenia', description: 'Síntomas psicóticos' },
  BOR: { label: 'Rasgos Límite', description: 'Inestabilidad e impulsividad' },
  ANT: { label: 'Rasgos Antisociales', description: 'Conducta antisocial' },
  ALC: { label: 'Problemas Alcohol', description: 'Consumo problemático' },
  DRG: { label: 'Problemas Drogas', description: 'Consumo de sustancias' },
  AGG: { label: 'Agresión', description: 'Potencial agresivo' },
  SUI: { label: 'Ideación Suicida', description: 'Pensamientos suicidas' },
  STR: { label: 'Estrés', description: 'Nivel de estrés' },
  NON: { label: 'Falta Apoyo', description: 'Aislamiento social' },
  RXR: { label: 'Rechazo Tratamiento', description: 'Resistencia al cambio' },
  DOM: { label: 'Dominancia', description: 'Tendencia a dominar' },
  WRM: { label: 'Afabilidad', description: 'Calidez interpersonal' },
};

export const PAI_CRITICAL_SCALES = ['SUI', 'AGG', 'SCZ', 'BOR'];

export function getPAITemplateData() {
  return {
    code: PAI_TEMPLATE.code,
    name: PAI_TEMPLATE.name,
    description: PAI_TEMPLATE.description,
    version: PAI_TEMPLATE.version,
    items: PAI_TEMPLATE.items,
    scoring: PAI_TEMPLATE.scoring,
    instructions: PAI_TEMPLATE.instructions,
    interpretations: null,
    is_active: true,
    response_min: PAI_TEMPLATE.response_min,
    response_max: PAI_TEMPLATE.response_max,
    min_label: PAI_TEMPLATE.min_label,
    max_label: PAI_TEMPLATE.max_label,
    flag_threshold: PAI_TEMPLATE.flag_threshold,
    chart_full_mark: PAI_TEMPLATE.chart_full_mark
  };
}
