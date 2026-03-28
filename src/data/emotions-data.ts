export interface DetailedEmotion {
  key: string;
  label: string;
}

export interface SecondaryEmotion {
  key: string;
  label: string;
  details: DetailedEmotion[];
}

export interface PrimaryEmotion {
  key: string;
  label: string;
  color: string;
  secondaries: SecondaryEmotion[];
}

export const EMOTIONS: PrimaryEmotion[] = [
  {
    key: 'happy',
    label: 'Feliz',
    color: '#F59E0B',
    secondaries: [
      { key: 'contento', label: 'Contento', details: [
        { key: 'satisfecho', label: 'Satisfecho' },
        { key: 'agradecido', label: 'Agradecido' },
        { key: 'a_gusto', label: 'A gusto' },
      ]},
      { key: 'orgulloso', label: 'Orgulloso', details: [
        { key: 'seguro', label: 'Seguro' },
        { key: 'capaz', label: 'Capaz' },
        { key: 'realizado', label: 'Realizado' },
      ]},
      { key: 'esperanzado', label: 'Esperanzado', details: [
        { key: 'optimista', label: 'Optimista' },
        { key: 'confiado', label: 'Confiado' },
        { key: 'ilusionado', label: 'Ilusionado' },
      ]},
      { key: 'tranquilo', label: 'Tranquilo', details: [
        { key: 'sereno', label: 'Sereno' },
        { key: 'relajado', label: 'Relajado' },
        { key: 'en_paz', label: 'En paz' },
      ]},
      { key: 'entusiasmado', label: 'Entusiasmado', details: [
        { key: 'emocionado', label: 'Emocionado' },
        { key: 'motivado', label: 'Motivado' },
        { key: 'animado', label: 'Animado' },
      ]},
    ],
  },
  {
    key: 'sad',
    label: 'Triste',
    color: '#3B82F6',
    secondaries: [
      { key: 'solo', label: 'Solo', details: [
        { key: 'abandonado', label: 'Abandonado' },
        { key: 'ignorado', label: 'Ignorado' },
        { key: 'incomprendido', label: 'Incomprendido' },
      ]},
      { key: 'vulnerable', label: 'Vulnerable', details: [
        { key: 'fragil', label: 'Frágil' },
        { key: 'indefenso', label: 'Indefenso' },
        { key: 'expuesto', label: 'Expuesto' },
      ]},
      { key: 'culpable', label: 'Culpable', details: [
        { key: 'avergonzado', label: 'Avergonzado' },
        { key: 'arrepentido', label: 'Arrepentido' },
        { key: 'responsable', label: 'Responsable' },
      ]},
      { key: 'deprimido', label: 'Deprimido', details: [
        { key: 'sin_energia', label: 'Sin energía' },
        { key: 'desanimado', label: 'Desanimado' },
        { key: 'desesperanzado', label: 'Desesperanzado' },
      ]},
      { key: 'vacio', label: 'Vacío', details: [
        { key: 'indiferente', label: 'Indiferente' },
        { key: 'adormecido', label: 'Adormecido' },
        { key: 'desconectado', label: 'Desconectado' },
      ]},
    ],
  },
  {
    key: 'angry',
    label: 'Enfadado',
    color: '#EF4444',
    secondaries: [
      { key: 'frustrado', label: 'Frustrado', details: [
        { key: 'bloqueado', label: 'Bloqueado' },
        { key: 'impotente', label: 'Impotente' },
        { key: 'desesperado', label: 'Desesperado' },
      ]},
      { key: 'molesto', label: 'Molesto', details: [
        { key: 'harto', label: 'Harto' },
        { key: 'cansado', label: 'Cansado' },
        { key: 'incomodo', label: 'Incómodo' },
      ]},
      { key: 'irritado', label: 'Irritado', details: [
        { key: 'tenso', label: 'Tenso' },
        { key: 'nervioso', label: 'Nervioso' },
        { key: 'agitado', label: 'Agitado' },
      ]},
      { key: 'agresivo', label: 'Agresivo', details: [
        { key: 'furioso', label: 'Furioso' },
        { key: 'explosivo', label: 'Explosivo' },
        { key: 'hostil', label: 'Hostil' },
      ]},
      { key: 'resentido', label: 'Resentido', details: [
        { key: 'amargado', label: 'Amargado' },
        { key: 'herido', label: 'Herido' },
        { key: 'traicionado', label: 'Traicionado' },
      ]},
    ],
  },
  {
    key: 'fear',
    label: 'Miedo',
    color: '#8B5CF6',
    secondaries: [
      { key: 'inseguro', label: 'Inseguro', details: [
        { key: 'dudoso', label: 'Dudoso' },
        { key: 'incapaz', label: 'Incapaz' },
        { key: 'con_verguenza', label: 'Con vergüenza' },
      ]},
      { key: 'ansioso', label: 'Ansioso', details: [
        { key: 'agitado', label: 'Agitado' },
        { key: 'inquieto', label: 'Inquieto' },
        { key: 'en_alerta', label: 'En alerta' },
      ]},
      { key: 'preocupado', label: 'Preocupado', details: [
        { key: 'pensativo', label: 'Pensativo' },
        { key: 'anticipando', label: 'Anticipando' },
        { key: 'rumiando', label: 'Rumiando' },
      ]},
      { key: 'amenazado', label: 'Amenazado', details: [
        { key: 'acorralado', label: 'Acorralado' },
        { key: 'en_peligro', label: 'En peligro' },
        { key: 'alerta', label: 'Alerta' },
      ]},
      { key: 'nervioso', label: 'Nervioso', details: [
        { key: 'tenso_miedo', label: 'Tenso' },
        { key: 'acelerado', label: 'Acelerado' },
        { key: 'agitado_miedo', label: 'Agitado' },
      ]},
    ],
  },
  {
    key: 'disgust',
    label: 'Asco',
    color: '#10B981',
    secondaries: [
      { key: 'rechazo', label: 'Rechazo', details: [
        { key: 'negacion', label: 'Negación' },
        { key: 'resistencia', label: 'Resistencia' },
        { key: 'distancia', label: 'Distancia' },
      ]},
      { key: 'aversion', label: 'Aversión', details: [
        { key: 'repulsa', label: 'Repulsa' },
        { key: 'nausea', label: 'Náusea' },
        { key: 'horror', label: 'Horror' },
      ]},
      { key: 'decepcion', label: 'Decepción', details: [
        { key: 'desilusion', label: 'Desilusión' },
        { key: 'frustracion', label: 'Frustración' },
        { key: 'traicion_esperada', label: 'Traición esperada' },
      ]},
      { key: 'incomodo_asco', label: 'Incómodo', details: [
        { key: 'molesto_asco', label: 'Molesto' },
        { key: 'fuera_de_lugar', label: 'Fuera de lugar' },
        { key: 'violento', label: 'Violento' },
      ]},
      { key: 'repelido', label: 'Repelido', details: [
        { key: 'asqueado', label: 'Asqueado' },
        { key: 'indignado', label: 'Indignado' },
        { key: 'horrorizado', label: 'Horrorizado' },
      ]},
    ],
  },
];

export const CONTEXT_OPTIONS = [
  { key: 'work', label: 'Trabajo' },
  { key: 'partner', label: 'Pareja' },
  { key: 'family', label: 'Familia' },
  { key: 'social', label: 'Social' },
  { key: 'health', label: 'Salud' },
  { key: 'alone', label: 'Solo' },
  { key: 'other', label: 'Otro' },
];

export const INTENSITY_LABELS = [
  { value: 1, label: 'Muy baja' },
  { value: 2, label: 'Baja' },
  { value: 3, label: 'Media' },
  { value: 4, label: 'Alta' },
  { value: 5, label: 'Muy alta' },
];
