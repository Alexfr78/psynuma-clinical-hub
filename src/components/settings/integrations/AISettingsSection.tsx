import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Brain, Check, CheckCircle2, ChevronDown, Info, Loader2, Save, RotateCcw, Thermometer } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { useCenter } from '@/hooks/useCenter';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_LAYER1_PROMPT,
  DEFAULT_LAYER2_PROMPT,
  DEFAULT_LAYER3_PROMPT,
} from '@/lib/defaultPrompts';

export function AISettingsSection() {
  const { center, updateCenter, centerId } = useCenter();

  const [aiProvider, setAiProvider] = useState('openai');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiModel, setOpenaiModel] = useState('gpt-4.1');
  const [customOpenaiModel, setCustomOpenaiModel] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-pro');
  const [customGeminiModel, setCustomGeminiModel] = useState('');
  const [retentionDays, setRetentionDays] = useState(7);
  const [aiTemperature, setAiTemperature] = useState(0.3);
  const [aiAnalysisMode, setAiAnalysisMode] = useState('layered');
  const [promptSystem, setPromptSystem] = useState('');
  const [promptLayer1, setPromptLayer1] = useState('');
  const [promptLayer2, setPromptLayer2] = useState('');
  const [promptLayer3, setPromptLayer3] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<'ok' | 'error' | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const openaiConfigured = !!(center as any)?.openai_api_key_encrypted;
  const geminiConfigured = !!(center as any)?.gemini_api_key_encrypted;

  const OPENAI_MODELS = ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'o1'];
  const GEMINI_MODELS = ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro'];

  const openaiModelIsCustom = openaiModel === 'custom' || (!OPENAI_MODELS.includes(openaiModel) && openaiModel !== '');
  const geminiModelIsCustom = geminiModel === 'custom' || (!GEMINI_MODELS.includes(geminiModel) && geminiModel !== '');

  useEffect(() => {
    if (center) {
      const c = center as any;
      setAiProvider(c.ai_provider || 'openai');
      const om = c.openai_model || 'gpt-4.1';
      if (OPENAI_MODELS.includes(om)) {
        setOpenaiModel(om);
      } else {
        setOpenaiModel('custom');
        setCustomOpenaiModel(om);
      }
      const gm = c.gemini_model || 'gemini-2.5-pro';
      if (GEMINI_MODELS.includes(gm)) {
        setGeminiModel(gm);
      } else {
        setGeminiModel('custom');
        setCustomGeminiModel(gm);
      }
      setRetentionDays(c.transcript_retention_days ?? 7);
      setAiTemperature(c.ai_temperature ?? 0.3);
      setAiAnalysisMode(c.ai_analysis_mode || 'layered');
      setPromptSystem(c.ai_prompt_system || '');
      setPromptLayer1(c.ai_prompt_layer1 || '');
      setPromptLayer2(c.ai_prompt_layer2 || '');
      setPromptLayer3(c.ai_prompt_layer3 || '');
    }
  }, [center]);

  const handleVerifyOpenAI = async () => {
    // Si hay key en el campo pero no guardada, guardarla primero
    if (openaiApiKey.trim()) {
      const { error } = await supabase.functions.invoke('save-oauth-credentials', {
        body: { provider: 'openai', credentials: { apiKey: openaiApiKey.trim() } },
      });
      if (error) {
        setVerifyResult('error');
        setVerifyError(`No se pudo guardar la key: ${error.message}`);
        return;
      }
      setOpenaiApiKey('');
    }

    setIsVerifying(true);
    setVerifyResult(null);
    setVerifyError(null);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-session-transcription', {
        body: { transcription: 'Test de conexión.', layer: 1, centerId },
      });
      if (error) throw new Error(error.message);
      if (data?.success) {
        setVerifyResult('ok');
      } else {
        setVerifyResult('error');
        setVerifyError(data?.error || 'Error desconocido');
      }
    } catch (err) {
      setVerifyResult('error');
      setVerifyError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const finalOpenaiModel = openaiModelIsCustom ? customOpenaiModel : openaiModel;
      const finalGeminiModel = geminiModelIsCustom ? customGeminiModel : geminiModel;

      await updateCenter.mutateAsync({
        ai_provider: aiProvider,
        openai_model: finalOpenaiModel || 'gpt-4.1',
        gemini_model: finalGeminiModel || 'gemini-2.5-pro',
        transcript_retention_days: retentionDays,
        ai_temperature: aiTemperature,
        ai_analysis_mode: aiAnalysisMode,
        ai_prompt_system: promptSystem || null,
        ai_prompt_layer1: promptLayer1 || null,
        ai_prompt_layer2: promptLayer2 || null,
        ai_prompt_layer3: promptLayer3 || null,
      } as any);

      if (openaiApiKey.trim()) {
        const { error: openaiError } = await supabase.functions.invoke('save-oauth-credentials', {
          body: { provider: 'openai', credentials: { apiKey: openaiApiKey.trim() } },
        });
        if (openaiError) {
          toast.error(`Error al guardar API key de OpenAI: ${openaiError.message}`);
          return;
        }
        setOpenaiApiKey('');
        toast.success('API key de OpenAI guardada correctamente');
      }

      if (geminiApiKey.trim()) {
        const { error: geminiError } = await supabase.functions.invoke('save-oauth-credentials', {
          body: { provider: 'gemini', credentials: { apiKey: geminiApiKey.trim() } },
        });
        if (geminiError) {
          toast.error(`Error al guardar API key de Gemini: ${geminiError.message}`);
          return;
        }
        setGeminiApiKey('');
        toast.success('API key de Gemini guardada correctamente');
      }

      toast.success('Configuración de IA guardada');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error(`Error al guardar: ${message}`);
      console.error('Error saving AI config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const promptFields = [
    { key: 'system', label: 'Prompt del sistema', state: promptSystem, setter: setPromptSystem, defaultVal: DEFAULT_SYSTEM_PROMPT },
    { key: 'layer1', label: 'Capa 1 — Extracción clínica base', state: promptLayer1, setter: setPromptLayer1, defaultVal: DEFAULT_LAYER1_PROMPT },
    { key: 'layer2', label: 'Capa 2 — Informe clínico', state: promptLayer2, setter: setPromptLayer2, defaultVal: DEFAULT_LAYER2_PROMPT },
    { key: 'layer3', label: 'Capa 3 — Informe para el paciente', state: promptLayer3, setter: setPromptLayer3, defaultVal: DEFAULT_LAYER3_PROMPT },
  ];

  return (
    <div className="space-y-6">
      {/* Provider selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Proveedor de IA activo
          </CardTitle>
          <CardDescription>
            Proveedor usado para generar los informes de sesión.
            La transcripción de audio con Whisper requiere OpenAI.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <button
            type="button"
            onClick={() => setAiProvider('openai')}
            className={cn(
              "flex w-full items-center gap-3 p-4 rounded-lg border-2 transition-colors text-left",
              aiProvider === 'openai' ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            )}
          >
            <div className="flex-1">
              <p className="font-medium">OpenAI</p>
              <p className="text-sm text-muted-foreground">GPT-4.1 · Whisper (audio)</p>
            </div>
            {aiProvider === 'openai' && <Check className="h-5 w-5 text-primary" />}
          </button>

          <button
            type="button"
            onClick={() => setAiProvider('gemini')}
            className={cn(
              "flex w-full items-center gap-3 p-4 rounded-lg border-2 transition-colors text-left",
              aiProvider === 'gemini' ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            )}
          >
            <div className="flex-1">
              <p className="font-medium">Google Gemini</p>
              <p className="text-sm text-muted-foreground">Gemini 2.5 Pro</p>
            </div>
            {aiProvider === 'gemini' && <Check className="h-5 w-5 text-primary" />}
          </button>

          {aiProvider === 'gemini' && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                La transcripción de audio con Whisper solo está disponible con OpenAI. Con Gemini deberás subir la transcripción en texto.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* OpenAI Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>OpenAI</CardTitle>
            {aiProvider === 'openai' && <Badge>Activo</Badge>}
            {openaiConfigured && <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400">✓ Configurado</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              placeholder="sk-..."
              value={openaiApiKey}
              onChange={(e) => setOpenaiApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">platform.openai.com/api-keys</a>
            </p>
            {openaiConfigured && !openaiApiKey && (
              <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                <CheckCircle2 className="h-3 w-3" />
                API key configurada y guardada. Deja vacío para mantener la actual.
              </div>
            )}
            {!openaiConfigured && !openaiApiKey && (
              <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-1">
                <AlertCircle className="h-3 w-3" />
                API key no configurada. Introduce tu key y guarda.
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Button size="sm" variant="outline" onClick={handleVerifyOpenAI} disabled={isVerifying || (!openaiConfigured && !openaiApiKey)}>
                {isVerifying ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                Verificar conexión
              </Button>
              {verifyResult === 'ok' && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Conexión correcta — API key funcionando
                </span>
              )}
              {verifyResult === 'error' && (
                <span className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Error: {verifyError}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Modelo</Label>
            <Select
              value={openaiModelIsCustom ? 'custom' : openaiModel}
              onValueChange={(v) => {
                if (v !== 'custom') { setOpenaiModel(v); setCustomOpenaiModel(''); }
                else { setOpenaiModel('custom'); }
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4.1">GPT-4.1 — Máxima capacidad (recomendado)</SelectItem>
                <SelectItem value="gpt-4.1-mini">GPT-4.1 Mini — Equilibrio calidad/coste</SelectItem>
                <SelectItem value="gpt-4.1-nano">GPT-4.1 Nano — Más económico</SelectItem>
                <SelectItem value="gpt-4o">GPT-4o (legacy)</SelectItem>
                <SelectItem value="o1">o1 — Razonamiento profundo</SelectItem>
                <SelectItem value="custom">Modelo personalizado...</SelectItem>
              </SelectContent>
            </Select>
            {openaiModelIsCustom && (
              <Input
                placeholder="Nombre del modelo (ej: gpt-5)"
                value={customOpenaiModel}
                onChange={(e) => setCustomOpenaiModel(e.target.value)}
                className="mt-2"
              />
            )}
            <p className="text-xs text-muted-foreground">
              Usa "Modelo personalizado" para nuevos modelos sin esperar actualizaciones de la app.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Gemini Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Google Gemini</CardTitle>
            {aiProvider === 'gemini' && <Badge>Activo</Badge>}
            {geminiConfigured && <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400">✓ Configurado</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              placeholder="AIza..."
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline">aistudio.google.com/apikey</a>
              {geminiConfigured && !geminiApiKey && " · Deja vacío para mantener la key actual"}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Modelo</Label>
            <Select
              value={geminiModelIsCustom ? 'custom' : geminiModel}
              onValueChange={(v) => {
                if (v !== 'custom') { setGeminiModel(v); setCustomGeminiModel(''); }
                else { setGeminiModel('custom'); }
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro (recomendado)</SelectItem>
                <SelectItem value="gemini-2.0-flash">Gemini 2.0 Flash — Más rápido</SelectItem>
                <SelectItem value="gemini-1.5-pro">Gemini 1.5 Pro</SelectItem>
                <SelectItem value="custom">Modelo personalizado...</SelectItem>
              </SelectContent>
            </Select>
            {geminiModelIsCustom && (
              <Input
                placeholder="Nombre del modelo"
                value={customGeminiModel}
                onChange={(e) => setCustomGeminiModel(e.target.value)}
                className="mt-2"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Temperature */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="h-5 w-5" />
            Temperatura del modelo
          </CardTitle>
          <CardDescription>
            Valores bajos (0.1-0.3) producen textos más precisos y predecibles. Valores altos (0.5-0.7) generan redacción más rica y variada. Recomendado para informes clínicos: 0.4-0.5
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Slider
              value={[aiTemperature]}
              onValueChange={([v]) => setAiTemperature(v)}
              min={0}
              max={1}
              step={0.1}
              className="flex-1"
            />
            <span className="text-sm font-mono font-semibold w-10 text-right">{aiTemperature.toFixed(1)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Analysis mode */}
      <Card>
        <CardHeader>
          <CardTitle>Modo de análisis</CardTitle>
          <CardDescription>
            Elige cómo se generan los informes a partir de la transcripción.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={aiAnalysisMode} onValueChange={setAiAnalysisMode} className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <RadioGroupItem value="layered" className="mt-1" />
              <div>
                <p className="font-medium text-sm">Análisis en 3 capas</p>
                <p className="text-xs text-muted-foreground">Extrae primero la base clínica y luego genera cada informe por separado. Mayor control, más lento.</p>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <RadioGroupItem value="single" className="mt-1" />
              <div>
                <p className="font-medium text-sm">Análisis directo</p>
                <p className="text-xs text-muted-foreground">Genera ambos informes en una sola llamada a partir de la transcripción completa. Más rápido, resultados más cohesionados.</p>
              </div>
            </label>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Retention */}
      <Card>
        <CardHeader>
          <CardTitle>Retención de transcripciones originales</CardTitle>
          <CardDescription>
            Por cumplimiento RGPD, las transcripciones originales se eliminan automáticamente. Los resúmenes generados se conservan indefinidamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={String(retentionDays)} onValueChange={(v) => setRetentionDays(Number(v))}>
            <SelectTrigger className="w-full max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Eliminar inmediatamente tras procesar (máxima privacidad)</SelectItem>
              <SelectItem value="1">1 día</SelectItem>
              <SelectItem value="7">7 días (recomendado)</SelectItem>
              <SelectItem value="30">30 días</SelectItem>
              <SelectItem value="90">90 días</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Custom Prompts */}
      <Card>
        <CardContent className="pt-6">
          <Collapsible open={promptsOpen} onOpenChange={setPromptsOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                <span className="font-medium">Prompts personalizados</span>
                <Badge variant="secondary" className="text-xs">Avanzado</Badge>
              </div>
              <ChevronDown className={cn("h-4 w-4 transition-transform", promptsOpen && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4 space-y-4">
              {promptFields.map(({ key, label, state, setter, defaultVal }) => (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{label}</Label>
                    <Button variant="ghost" size="sm" onClick={() => setter('')}>
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Restaurar por defecto
                    </Button>
                  </div>
                  <Textarea
                    value={state}
                    onChange={(e) => setter(e.target.value)}
                    className="min-h-[120px] text-xs font-mono"
                    placeholder={defaultVal.slice(0, 200) + '...'}
                  />
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Guardar configuración de IA
        </Button>
      </div>
    </div>
  );
}
