import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";
import { unauthorizedResponse } from "../_shared/authGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_CHUNK_SIZE = 24 * 1024 * 1024; // 24MB per chunk
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB total max

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Require authenticated user JWT and verify center membership
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!jwt) return unauthorizedResponse(corsHeaders);
  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(jwt);
  const role = (claimsData?.claims as any)?.role;
  const userId = (claimsData?.claims as any)?.sub as string | undefined;
  if (claimsError || (role !== "authenticated" && role !== "service_role")) {
    return unauthorizedResponse(corsHeaders);
  }

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

    if (role === "authenticated" && userId) {
      const { data: prof } = await supabase.from("profiles").select("center_id").eq("id", userId).maybeSingle();
      if (!prof || (prof as any).center_id !== centerId) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    if (audioFile.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({
          error: `El archivo supera el límite de 200MB (${(audioFile.size / 1024 / 1024).toFixed(1)}MB).`,
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
          error: "La transcripción de audio con Whisper solo está disponible con OpenAI.",
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

    const rawKey = await decryptSecret(center.openai_api_key_encrypted);
    // Sanitize: keep only printable ASCII characters
    const openaiKey = rawKey.replace(/[^\x20-\x7E]/g, '').trim();
    
    if (!openaiKey || !openaiKey.startsWith('sk-')) {
      console.error(`[transcribe] Invalid key after decrypt: length=${rawKey.length}, printable=${openaiKey.length}, starts=${openaiKey.substring(0, 5)}`);
      return new Response(
        JSON.stringify({ error: "La API key de OpenAI almacenada parece corrupta. Ve a Ajustes → Inteligencia Artificial y vuelve a guardarla." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const fileExtension = fileName.substring(fileName.lastIndexOf("."));
    const mimeType = audioFile.type || "audio/mpeg";

    const transcribeChunk = async (chunk: Blob, index: number, total: number): Promise<string> => {
      const chunkFile = new File(
        [chunk],
        `chunk_${index + 1}${fileExtension}`,
        { type: mimeType },
      );

      const whisperFormData = new FormData();
      whisperFormData.append("file", chunkFile);
      whisperFormData.append("model", "whisper-1");
      whisperFormData.append("language", "es");
      whisperFormData.append("response_format", "text");

      console.log(`[transcribe] Fragmento ${index + 1}/${total} (${(chunk.size / 1024 / 1024).toFixed(1)}MB)`);

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: whisperFormData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Error Whisper en fragmento ${index + 1}: ${response.status}`);
      }

      return await response.text();
    };

    let transcription: string;

    if (audioFile.size <= MAX_CHUNK_SIZE) {
      console.log(`[transcribe] Archivo único: ${audioFile.name} (${(audioFile.size / 1024 / 1024).toFixed(1)}MB)`);
      transcription = await transcribeChunk(audioFile, 0, 1);
    } else {
      const arrayBuffer = await audioFile.arrayBuffer();
      const totalChunks = Math.ceil(arrayBuffer.byteLength / MAX_CHUNK_SIZE);

      console.log(`[transcribe] Archivo grande (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)}MB) → ${totalChunks} fragmentos`);

      const transcriptions: string[] = [];

      for (let i = 0; i < totalChunks; i++) {
        const start = i * MAX_CHUNK_SIZE;
        const end = Math.min(start + MAX_CHUNK_SIZE, arrayBuffer.byteLength);
        const chunk = new Blob([arrayBuffer.slice(start, end)], { type: mimeType });
        const chunkText = await transcribeChunk(chunk, i, totalChunks);
        transcriptions.push(chunkText.trim());
      }

      transcription = transcriptions.join(" ");
    }

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
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
