import { useState } from 'react';
import { EMOTIONS, CONTEXT_OPTIONS, INTENSITY_LABELS } from '@/data/emotions-data';
import type { PrimaryEmotion, SecondaryEmotion } from '@/data/emotions-data';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function EmotionalRecord() {
  const { profile } = useAuth();

  const [primaryEmotion, setPrimaryEmotion] = useState<PrimaryEmotion | null>(null);
  const [secondaryEmotion, setSecondaryEmotion] = useState<SecondaryEmotion | null>(null);
  const [detailedEmotion, setDetailedEmotion] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [intensity, setIntensity] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [context, setContext] = useState<string | undefined>(undefined);
  const [thought, setThought] = useState('');
  const [reaction, setReaction] = useState('');
  const [need, setNeed] = useState('');
  const [showDeepDive, setShowDeepDive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ primary?: string; intensity?: string }>({});

  const activeColor = primaryEmotion?.color || '#6B7280';

  const resetForm = () => {
    setPrimaryEmotion(null);
    setSecondaryEmotion(null);
    setDetailedEmotion(null);
    setShowDetails(false);
    setIntensity(null);
    setNote('');
    setContext(undefined);
    setThought('');
    setReaction('');
    setNeed('');
    setShowDeepDive(false);
    setErrors({});
  };

  const handleSave = async () => {
    const newErrors: typeof errors = {};
    if (!primaryEmotion) newErrors.primary = 'Elige una emoción para continuar';
    if (!intensity) newErrors.intensity = 'Elige una intensidad para continuar';
    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }

    if (!profile?.center_id) {
      toast({ title: 'Error', description: 'No se encontró el centro', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('emotional_records' as any).insert({
        patient_id: profile.id,
        center_id: profile.center_id,
        record_date: new Date().toISOString().split('T')[0],
        primary_emotion: primaryEmotion!.key,
        secondary_emotion: secondaryEmotion!.key,
        detailed_emotion: detailedEmotion || null,
        intensity,
        note: note.trim() || null,
        context: context || null,
        thought: thought.trim() || null,
        reaction: reaction.trim() || null,
        need: need.trim() || null,
        helpful_action: null,
      } as any);

      if (error) throw error;
      toast({ title: 'Registro guardado' });
      resetForm();
    } catch (err: any) {
      toast({ title: 'Error al guardar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-8 space-y-8">
      {/* Step 1: Primary emotion */}
      <section className="space-y-3">
        <h1 className="text-xl font-bold text-foreground">¿Cómo te has sentido hoy?</h1>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {EMOTIONS.map((em) => {
            const selected = primaryEmotion?.key === em.key;
            return (
              <button
                key={em.key}
                onClick={() => {
                  setPrimaryEmotion(em);
                  setSecondaryEmotion(null);
                  setDetailedEmotion(null);
                  setShowDetails(false);
                  setErrors((e) => ({ ...e, primary: undefined }));
                }}
                className="flex items-center justify-center rounded-xl border-2 px-4 py-4 text-base font-semibold transition-all duration-150 min-h-[56px]"
                style={{
                  borderColor: em.color,
                  backgroundColor: selected ? em.color : `${em.color}18`,
                  color: selected ? '#fff' : em.color,
                }}
              >
                {em.label}
              </button>
            );
          })}
        </div>
        {errors.primary && <p className="text-sm text-destructive">{errors.primary}</p>}
      </section>

      {/* Step 2: Secondary emotions */}
      {primaryEmotion && (
        <section className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <h2 className="text-lg font-semibold text-foreground">Más concretamente…</h2>
          <div className="flex flex-wrap gap-2">
            {primaryEmotion.secondaries.map((sec) => {
              const selected = secondaryEmotion?.key === sec.key;
              return (
                <button
                  key={sec.key}
                  onClick={() => {
                    setSecondaryEmotion(sec);
                    setDetailedEmotion(null);
                    setShowDetails(false);
                  }}
                  className="rounded-lg border px-4 py-2 text-sm font-medium transition-all duration-150"
                  style={{
                    borderColor: activeColor,
                    backgroundColor: selected ? activeColor : `${activeColor}18`,
                    color: selected ? '#fff' : activeColor,
                  }}
                >
                  {sec.label}
                </button>
              );
            })}
          </div>

          {/* Optional detail level */}
          {secondaryEmotion && secondaryEmotion.details.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
              >
                {showDetails ? 'Cerrar detalle' : 'Afinar más'}
              </button>
              {showDetails && (
                <div className="flex flex-wrap gap-2 animate-in fade-in duration-150">
                  {secondaryEmotion.details.map((d) => {
                    const selected = detailedEmotion === d.key;
                    return (
                      <button
                        key={d.key}
                        onClick={() => setDetailedEmotion(selected ? null : d.key)}
                        className="rounded-md border px-3 py-1.5 text-xs font-medium transition-all duration-150"
                        style={{
                          borderColor: activeColor,
                          backgroundColor: selected ? activeColor : `${activeColor}10`,
                          color: selected ? '#fff' : activeColor,
                        }}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Step 3: Intensity */}
      {secondaryEmotion && (
        <section className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <h2 className="text-lg font-semibold text-foreground">¿Con qué intensidad?</h2>
          <div className="grid grid-cols-5 gap-2">
            {INTENSITY_LABELS.map((item) => {
              const selected = intensity === item.value;
              return (
                <button
                  key={item.value}
                  onClick={() => {
                    setIntensity(item.value);
                    setErrors((e) => ({ ...e, intensity: undefined }));
                  }}
                  className="flex flex-col items-center justify-center rounded-xl border-2 px-1 py-3 text-xs font-medium transition-all duration-150 min-h-[56px]"
                  style={{
                    borderColor: activeColor,
                    backgroundColor: selected ? activeColor : 'transparent',
                    color: selected ? '#fff' : activeColor,
                  }}
                >
                  <span className="text-lg font-bold">{item.value}</span>
                  <span className="leading-tight">{item.label}</span>
                </button>
              );
            })}
          </div>
          {errors.intensity && <p className="text-sm text-destructive">{errors.intensity}</p>}
        </section>
      )}

      {/* Step 4: Note */}
      {intensity && (
        <section className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="¿Qué ha pasado? (opcional)"
            className="rounded-xl"
          />
        </section>
      )}

      {/* Deep dive block */}
      {intensity && (
        <section className="animate-in fade-in slide-in-from-top-2 duration-200">
          <button
            onClick={() => setShowDeepDive(!showDeepDive)}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {showDeepDive ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showDeepDive ? 'Cerrar profundización' : 'Profundizar un poco más'}
          </button>

          {showDeepDive && (
            <div className="mt-4 space-y-4 rounded-xl border border-border p-4 animate-in fade-in duration-150">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Contexto</label>
                <Select value={context} onValueChange={setContext}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Selecciona un contexto" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTEXT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Pensamiento asociado</label>
                <Textarea
                  value={thought}
                  onChange={(e) => setThought(e.target.value)}
                  placeholder="¿Qué pensamiento tenías?"
                  rows={3}
                  className="rounded-xl resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Reacción o conducta</label>
                <Textarea
                  value={reaction}
                  onChange={(e) => setReaction(e.target.value)}
                  placeholder="¿Cómo reaccionaste?"
                  rows={3}
                  className="rounded-xl resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Algo que podría ayudarte ahora</label>
                <Input
                  value={need}
                  onChange={(e) => setNeed(e.target.value)}
                  placeholder="¿Qué necesitas ahora mismo?"
                  className="rounded-xl"
                />
              </div>
            </div>
          )}
        </section>
      )}

      {/* Save button */}
      {intensity && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-xl py-6 text-base font-semibold"
            style={{ backgroundColor: activeColor }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Guardar registro
          </Button>
        </div>
      )}
    </div>
  );
}
