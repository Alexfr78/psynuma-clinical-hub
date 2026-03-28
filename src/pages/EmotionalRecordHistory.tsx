import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { EMOTIONS, CONTEXT_OPTIONS, INTENSITY_LABELS } from '@/data/emotions-data';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, List, CalendarDays, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface EmotionalRecord {
  id: string;
  record_date: string;
  primary_emotion: string;
  secondary_emotion: string;
  detailed_emotion: string | null;
  intensity: number;
  note: string | null;
  context: string | null;
  thought: string | null;
  reaction: string | null;
  need: string | null;
  helpful_action: string | null;
}

const getEmotionColor = (key: string) => EMOTIONS.find(e => e.key === key)?.color || '#6B7280';
const getEmotionLabel = (key: string) => EMOTIONS.find(e => e.key === key)?.label || key;
const getSecondaryLabel = (primaryKey: string, secondaryKey: string) => {
  const primary = EMOTIONS.find(e => e.key === primaryKey);
  return primary?.secondaries.find(s => s.key === secondaryKey)?.label || secondaryKey;
};
const getDetailedLabel = (primaryKey: string, secondaryKey: string, detailedKey: string) => {
  const primary = EMOTIONS.find(e => e.key === primaryKey);
  const secondary = primary?.secondaries.find(s => s.key === secondaryKey);
  return secondary?.details.find(d => d.key === detailedKey)?.label || detailedKey;
};
const getContextLabel = (key: string) => CONTEXT_OPTIONS.find(c => c.key === key)?.label || key;

function IntensityBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className="h-2 w-5 rounded-sm"
          style={{ backgroundColor: i <= value ? color : `${color}25` }}
        />
      ))}
    </div>
  );
}

function RecordCard({ record }: { record: EmotionalRecord }) {
  const [expanded, setExpanded] = useState(false);
  const color = getEmotionColor(record.primary_emotion);
  const dateStr = format(parseISO(record.record_date), "EEEE d 'de' MMMM", { locale: es });
  const hasDeepDive = record.context || record.thought || record.reaction || record.need || record.helpful_action;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex">
        <div className="w-1.5 shrink-0" style={{ backgroundColor: color }} />
        <div className="flex-1 p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground capitalize">{dateStr}</p>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color }}>
                  {getEmotionLabel(record.primary_emotion)}
                </span>
                <span className="text-sm text-foreground">
                  · {getSecondaryLabel(record.primary_emotion, record.secondary_emotion)}
                </span>
                {record.detailed_emotion && (
                  <span className="text-xs text-muted-foreground">
                    · {getDetailedLabel(record.primary_emotion, record.secondary_emotion, record.detailed_emotion)}
                  </span>
                )}
              </div>
              <IntensityBar value={record.intensity} color={color} />
            </div>
            {hasDeepDive && (
              <button onClick={() => setExpanded(!expanded)} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}
          </div>
          {record.note && <p className="text-sm text-muted-foreground">{record.note}</p>}
          {expanded && hasDeepDive && (
            <div className="pt-2 border-t border-border space-y-2 text-sm animate-in fade-in duration-150">
              {record.context && (
                <div><span className="font-medium text-foreground">Contexto:</span> <span className="text-muted-foreground">{getContextLabel(record.context)}</span></div>
              )}
              {record.thought && (
                <div><span className="font-medium text-foreground">Pensamiento:</span> <span className="text-muted-foreground">{record.thought}</span></div>
              )}
              {record.reaction && (
                <div><span className="font-medium text-foreground">Reacción:</span> <span className="text-muted-foreground">{record.reaction}</span></div>
              )}
              {record.need && (
                <div><span className="font-medium text-foreground">Necesidad:</span> <span className="text-muted-foreground">{record.need}</span></div>
              )}
              {record.helpful_action && (
                <div><span className="font-medium text-foreground">Acción útil:</span> <span className="text-muted-foreground">{record.helpful_action}</span></div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CalendarView({ records }: { records: EmotionalRecord[] }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedRecord, setSelectedRecord] = useState<EmotionalRecord | null>(null);

  const recordsByDate = useMemo(() => {
    const map = new Map<string, EmotionalRecord>();
    // Last one per date wins (records already sorted desc, so reverse to get last=latest)
    [...records].reverse().forEach(r => map.set(r.record_date, r));
    return map;
  }, [records]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = (getDay(monthStart) + 6) % 7; // Monday=0

  const weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="p-2 hover:bg-accent rounded-lg transition-colors">
          <ChevronLeft className="h-5 w-5 text-muted-foreground" />
        </button>
        <h3 className="text-base font-semibold text-foreground capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: es })}
        </h3>
        <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="p-2 hover:bg-accent rounded-lg transition-colors">
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map(d => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
        ))}
        {Array.from({ length: startDayOfWeek }).map((_, i) => <div key={`empty-${i}`} />)}
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const record = recordsByDate.get(dateStr);
          const color = record ? getEmotionColor(record.primary_emotion) : undefined;
          const isToday = isSameDay(day, new Date());

          return (
            <button
              key={dateStr}
              onClick={() => record && setSelectedRecord(record)}
              className={`relative flex items-center justify-center rounded-lg aspect-square text-sm transition-colors ${
                record ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
              } ${isToday ? 'ring-2 ring-primary ring-offset-1' : ''}`}
              style={record ? { backgroundColor: `${color}20` } : undefined}
            >
              <span className={record ? 'font-semibold' : 'text-muted-foreground'} style={record ? { color } : undefined}>
                {format(day, 'd')}
              </span>
              {record && (
                <div className="absolute bottom-1 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Detail modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setSelectedRecord(null)}>
          <div className="w-full max-w-lg bg-card rounded-t-2xl sm:rounded-2xl p-6 space-y-3 animate-in slide-in-from-bottom-4 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground capitalize">
                {format(parseISO(selectedRecord.record_date), "EEEE d 'de' MMMM", { locale: es })}
              </h3>
              <button onClick={() => setSelectedRecord(null)} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <RecordCard record={selectedRecord} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmotionalRecordHistory() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [records, setRecords] = useState<EmotionalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'calendar'>('list');

  useEffect(() => {
    if (!profile?.id) return;
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('emotional_records' as any)
        .select('*')
        .eq('patient_id', profile.id)
        .order('record_date', { ascending: false });
      setRecords((data as any as EmotionalRecord[]) || []);
      setLoading(false);
    };
    fetch();
  }, [profile?.id]);

  return (
    <div className="mx-auto max-w-lg px-4 py-6 pb-24 space-y-6">
      <Tabs value={tab} onValueChange={v => setTab(v as any)}>
        <TabsList className="w-full">
          <TabsTrigger value="list" className="flex-1 gap-1.5">
            <List className="h-4 w-4" /> Lista
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex-1 gap-1.5">
            <CalendarDays className="h-4 w-4" /> Calendario
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
          <p className="text-muted-foreground">Aún no tienes registros. Empieza hoy.</p>
          <Button variant="outline" onClick={() => navigate('/emotional-record/new')}>Crear primer registro</Button>
        </div>
      ) : tab === 'list' ? (
        <div className="space-y-3">
          {records.map(r => <RecordCard key={r.id} record={r} />)}
        </div>
      ) : (
        <CalendarView records={records} />
      )}

      {/* FAB */}
      <button
        onClick={() => navigate('/emotional-record/new')}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}
