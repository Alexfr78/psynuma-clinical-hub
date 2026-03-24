import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB Whisper limit

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;
    const centerId = formData.get("centerId") as string;

    if (!audioFile || !centerId) {
      return new Response(
        JSON.stringify({ error: "Audio y centerId son requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (audioFile.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({
          error: `El archivo supera el límite de 25MB (${(audioFile.size / 1024 / 1024).toFixed(1)}MB). Por favor comprime el audio antes de subirlo.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const allowedExtensions = [".mp3", ".mp4", ".m4a", ".wav", ".webm", ".ogg", ".flac"];
    const fileName = audioFile.name.toLowerCase();
    const hasValidExtension = allowedExtensions.some((ext) => fileName.endsWith(ext));

    if (!hasValidExtension) {
      return new Response(
        JSON.stringify({ error: "Formato no soportado. Usa MP3, M4A, WAV, MP4, WebM, OGG o FLAC." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: center } = await supabase
      .from("centers")
      .select("openai_api_key_encrypted, ai_provider")
      .eq("id", centerId)
      .single();

    if (center?.ai_provider === "gemini") {
      return new Response(
        JSON.stringify({
          error: "La transcripción de audio con Whisper solo está disponible con OpenAI. Cambia el proveedor activo en Ajustes → Inteligencia Artificial.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!center?.openai_api_key_encrypted) {
      return new Response(
        JSON.stringify({ error: "API key de OpenAI no configurada. Ve a Ajustes → Inteligencia Artificial." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiKey = await decryptSecret(center.openai_api_key_encrypted);

    const whisperFormData = new FormData();
    whisperFormData.append("file", audioFile);
    whisperFormData.append("model", "whisper-1");
    whisperFormData.append("language", "es");
    whisperFormData.append("response_format", "text");

    console.log(`[transcribe] Enviando a Whisper: ${audioFile.name} (${(audioFile.size / 1024 / 1024).toFixed(1)}MB)`);

    const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: whisperFormData,
    });

    if (!whisperResponse.ok) {
      const errorData = await whisperResponse.json();
      console.error("[transcribe] Whisper error:", errorData);
      return new Response(
        JSON.stringify({ error: errorData.error?.message || "Error al transcribir el audio" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const transcription = await whisperResponse.text();
    const wordCount = transcription.split(/\s+/).filter(Boolean).length;

    console.log(`[transcribe] Completado: ${wordCount} palabras`);

    return new Response(
      JSON.stringify({
        success: true,
        transcription,
        wordCount,
        fileSizeMB: (audioFile.size / 1024 / 1024).toFixed(1),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[transcribe] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
