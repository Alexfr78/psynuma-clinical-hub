/**
 * Shared Plaud MCP OAuth + JSON-RPC helpers.
 *
 * Plaud exposes a remote MCP server at mcp.plaud.ai with standard OAuth 2.1 +
 * PKCE discovery (RFC 8414 / RFC 9728) and RFC 7591 dynamic client
 * registration — see plaud-oauth-start for why dynamic registration was
 * chosen over asking the owner to register a client by hand (there is no
 * documented manual "create an app" console for third parties).
 *
 * Endpoints below were confirmed by reading Plaud's public OAuth discovery
 * documents (GET https://mcp.plaud.ai/.well-known/oauth-authorization-server)
 * during the design phase of this integration. What was NOT confirmed with a
 * real, valid token: the exact shape of a tools/call response for
 * list_files/get_transcript/get_note/get_file/get_current_user, and whether
 * the server requires an initialize handshake (and an Mcp-Session-Id) before
 * accepting tools/call. callPlaudTool() below is written defensively for
 * both possibilities. See the delivery notes for what still needs a live
 * smoke test.
 *
 * Contract for the rest of the ingestion pipeline (built by other agents):
 *   - getValidPlaudAccessToken(supabase, centerId): never throws.
 *   - callPlaudTool(accessToken, tool, args): never throws.
 * Everything else in this file is an implementation detail used by the
 * plaud-oauth-start / plaud-oauth-callback / refresh-plaud-tokens edge
 * functions, but is exported in case a future function needs it directly.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret, encryptSecret } from "./crypto.ts";

export const PLAUD_MCP_ENDPOINT = "https://mcp.plaud.ai/mcp";
export const PLAUD_AUTHORIZE_ENDPOINT = "https://mcp.plaud.ai/authorize";
export const PLAUD_TOKEN_ENDPOINT = "https://mcp.plaud.ai/token";
export const PLAUD_REGISTER_ENDPOINT = "https://mcp.plaud.ai/register";

// Tools confirmed to exist on the Plaud MCP server (read-only, per the
// integration design — nothing here ever writes to the owner's Plaud
// account).
export type PlaudTool =
  | "get_current_user"
  | "list_files"
  | "get_file"
  | "get_note"
  | "get_transcript";

// ---------------------------------------------------------------------------
// PKCE + dynamic client registration
// ---------------------------------------------------------------------------

function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Generates an RFC 7636 PKCE verifier/challenge pair (S256). */
export async function generatePkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const challengeBytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  );
  return { verifier, challenge: base64UrlEncode(challengeBytes) };
}

/** Generates a random opaque OAuth `state` value. */
export function generatePlaudOAuthState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(24)));
}

export interface PlaudClientRegistration {
  clientId: string;
  clientSecret?: string;
}

/**
 * Registers a fresh OAuth client via RFC 7591 dynamic registration
 * (POST /register, no auth required — confirmed live during the design
 * phase: it returns 201 with a client_id for an unauthenticated caller).
 * Requests a public client (token_endpoint_auth_method: 'none'), matching
 * the discovery document's advertised support for "none" and avoiding ever
 * having to store a confidential client_secret.
 */
export async function registerPlaudClient(redirectUri: string): Promise<PlaudClientRegistration> {
  const response = await fetch(PLAUD_REGISTER_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Psycma",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Plaud dynamic client registration failed: ${response.status} ${text.slice(0, 500)}`);
  }

  let data: { client_id?: string; client_secret?: string };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Plaud dynamic client registration returned an invalid JSON body");
  }
  if (!data.client_id) {
    throw new Error("Plaud dynamic client registration did not return a client_id");
  }
  return { clientId: data.client_id, clientSecret: data.client_secret };
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

/** Thrown when Plaud's backend confirms the refresh token itself is dead
 * (revoked/expired/invalid client) — the connection needs the owner to
 * reconnect through the UI, not just retry later. */
export class PlaudReconnectError extends Error {}

export interface PlaudTokenRefreshResult {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

/**
 * Refreshes an access token. Confirmed live during the design phase (with a
 * deliberately invalid refresh_token) that POST /token forwards the request
 * synchronously to Plaud's real backend and returns its error verbatim
 * (`"Plaud token refresh: 401 {\"detail\":\"REFRESH_TOKEN_INVALID\"}"`) —
 * i.e. this is a plain server-to-server HTTP exchange with no browser step.
 * What was NOT confirmed: the response shape for a *successful* refresh
 * (no valid refresh_token was available to test with) — this assumes the
 * standard RFC 6749 token response shape used by every other provider in
 * this codebase (access_token/refresh_token/expires_in).
 */
export async function refreshPlaudAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret?: string
): Promise<PlaudTokenRefreshResult> {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  if (clientSecret) {
    headers["Authorization"] = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  }

  const response = await fetch(PLAUD_TOKEN_ENDPOINT, { method: "POST", headers, body });
  const text = await response.text();

  if (!response.ok) {
    let parsedError: { error?: string } = {};
    try {
      parsedError = JSON.parse(text);
    } catch {
      // not JSON, keep raw text for the error message below
    }
    const needsReconnect =
      response.status === 401 ||
      parsedError.error === "invalid_grant" ||
      parsedError.error === "invalid_client";
    if (needsReconnect) {
      throw new PlaudReconnectError(`Plaud token refresh: ${response.status} ${text.slice(0, 300)}`);
    }
    throw new Error(`Plaud token refresh failed: ${response.status} ${text.slice(0, 300)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Plaud token refresh returned an invalid JSON body");
  }
}

// ---------------------------------------------------------------------------
// getValidPlaudAccessToken — the contract other agents build on
// ---------------------------------------------------------------------------

export interface PlaudTokenResult {
  accessToken: string | null;
  reason?: "not_connected" | "disabled" | "needs_reconnect" | "refresh_failed";
}

// Refresh a bit before expiry so an ingestion job never races a token that
// dies mid-request. The refresh-plaud-tokens cron already does this
// proactively every 15 min with its own (larger) buffer; this is the
// on-demand safety net for whenever the cron hasn't run yet or failed.
const ACCESS_TOKEN_BUFFER_MS = 2 * 60 * 1000;

/**
 * Returns a valid Plaud access token for a center, refreshing it first if
 * needed. Never throws — every failure mode is reported through `reason`
 * instead, because this is meant to be called from ingestion jobs that must
 * keep going (or cleanly skip a center) rather than crash a whole batch run.
 *
 * `disabled` is returned whenever `center_plaud_connections.enabled` is
 * false, REGARDLESS of whether the OAuth connection itself is healthy. This
 * is the single gate that keeps ingestion off until the center owner turns
 * it on by hand — callers must never bypass this function to read tokens
 * directly from the table.
 */
export async function getValidPlaudAccessToken(
  supabase: SupabaseClient,
  centerId: string
): Promise<PlaudTokenResult> {
  try {
    const { data: connection, error } = await supabase
      .from("center_plaud_connections")
      .select(
        "access_token_encrypted, refresh_token_encrypted, token_expires_at, enabled, needs_reconnect, plaud_client_id_encrypted, plaud_client_secret_encrypted"
      )
      .eq("center_id", centerId)
      .maybeSingle();

    if (error) {
      console.error("[plaud] Error fetching connection:", error);
      return { accessToken: null, reason: "not_connected" };
    }
    if (!connection) {
      return { accessToken: null, reason: "not_connected" };
    }
    if (!connection.enabled) {
      return { accessToken: null, reason: "disabled" };
    }
    if (connection.needs_reconnect) {
      return { accessToken: null, reason: "needs_reconnect" };
    }
    if (!connection.refresh_token_encrypted || !connection.plaud_client_id_encrypted) {
      return { accessToken: null, reason: "needs_reconnect" };
    }

    const stillValid =
      !!connection.token_expires_at &&
      new Date(connection.token_expires_at).getTime() - Date.now() > ACCESS_TOKEN_BUFFER_MS;

    if (stillValid && connection.access_token_encrypted) {
      try {
        return { accessToken: await decryptSecret(connection.access_token_encrypted) };
      } catch (decryptError) {
        console.error("[plaud] Failed to decrypt cached access token, forcing refresh:", decryptError);
        // fall through to refresh below
      }
    }

    const clientId = await decryptSecret(connection.plaud_client_id_encrypted);
    const clientSecret = connection.plaud_client_secret_encrypted
      ? await decryptSecret(connection.plaud_client_secret_encrypted)
      : undefined;
    const refreshToken = await decryptSecret(connection.refresh_token_encrypted);

    const refreshed = await refreshPlaudAccessToken(refreshToken, clientId, clientSecret);

    const { error: updateError } = await supabase
      .from("center_plaud_connections")
      .update({
        access_token_encrypted: await encryptSecret(refreshed.access_token),
        refresh_token_encrypted: refreshed.refresh_token
          ? await encryptSecret(refreshed.refresh_token)
          : connection.refresh_token_encrypted,
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        last_refresh_at: new Date().toISOString(),
        last_refresh_result: "success",
        last_error: null,
      })
      .eq("center_id", centerId);

    if (updateError) {
      console.error("[plaud] Failed to persist refreshed token:", updateError);
      // We still have a usable token for this call even if the DB write
      // failed; the next call will just refresh again.
    }

    return { accessToken: refreshed.access_token };
  } catch (error) {
    if (error instanceof PlaudReconnectError) {
      try {
        await supabase
          .from("center_plaud_connections")
          .update({
            needs_reconnect: true,
            last_refresh_at: new Date().toISOString(),
            last_refresh_result: `error:${error.message.slice(0, 200)}`,
            last_error: "El acceso a Plaud fue revocado o caducó. Reconecta desde Configuración.",
          })
          .eq("center_id", centerId);
      } catch (updateError) {
        console.error("[plaud] Failed to mark needs_reconnect:", updateError);
      }
      return { accessToken: null, reason: "needs_reconnect" };
    }
    console.error("[plaud] getValidPlaudAccessToken failed:", error);
    return { accessToken: null, reason: "refresh_failed" };
  }
}

// ---------------------------------------------------------------------------
// callPlaudTool — JSON-RPC 2.0 over plain POST (no MCP SDK)
// ---------------------------------------------------------------------------

interface JsonRpcErrorShape {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcResponseShape {
  jsonrpc?: "2.0";
  id?: number | string;
  result?: {
    structuredContent?: unknown;
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  error?: JsonRpcErrorShape;
}

async function postPlaudJsonRpc(
  accessToken: string,
  sessionId: string | null,
  body: Record<string, unknown>
): Promise<{ response: Response; text: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${accessToken}`,
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const response = await fetch(PLAUD_MCP_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { response, text };
}

/**
 * Parses a JSON-RPC response body. Plaud's server was confirmed (Fase 0
 * validation) to answer plain JSON-RPC over POST without requiring an SSE
 * upgrade, so the primary path is a direct JSON.parse. The SSE-framed
 * fallback below ("data: {...}" lines) guards against a Streamable HTTP
 * server choosing to answer with an event stream anyway — not observed in
 * testing, but callPlaudTool must never throw, so it costs nothing to
 * handle.
 */
function parseJsonRpcBody(text: string): JsonRpcResponseShape | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const dataLines = trimmed
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    for (const line of dataLines.reverse()) {
      try {
        return JSON.parse(line);
      } catch {
        continue;
      }
    }
    return null;
  }
}

/**
 * Calls one tool on Plaud's remote MCP server. Never throws: every failure
 * (network, HTTP, JSON-RPC error, malformed body) comes back as
 * `{ ok: false, error }` so ingestion jobs can log-and-skip a single
 * recording without a whole batch run crashing.
 *
 * NOT verified with a real access token (no live Plaud OAuth token was
 * available during this build — see delivery notes): whether an
 * `initialize` handshake is required before `tools/call`, whether the
 * server issues an `Mcp-Session-Id` that must be echoed back, and the exact
 * shape of a successful tools/call result for each of the five tools this
 * integration uses. This function attempts the handshake defensively and
 * degrades gracefully if the server turns out to be stateless (which is
 * consistent with the confirmed behavior of the unauthenticated `initialize`
 * probe: a plain JSON POST answered directly, no session negotiation
 * enforced at that stage).
 */
export async function callPlaudTool<T>(
  accessToken: string,
  tool: PlaudTool | string,
  args: Record<string, unknown>
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    let sessionId: string | null = null;
    try {
      const { response: initResponse, text: initText } = await postPlaudJsonRpc(accessToken, null, {
        jsonrpc: "2.0",
        id: "init",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "psycma", version: "1.0.0" },
        },
      });
      sessionId = initResponse.headers.get("Mcp-Session-Id");
      if (!initResponse.ok) {
        console.warn(
          `[plaud] initialize handshake returned ${initResponse.status}, continuing without a session:`,
          initText.slice(0, 500)
        );
      }
    } catch (initError) {
      console.warn("[plaud] initialize handshake failed, continuing without a session:", initError);
    }

    const { response, text } = await postPlaudJsonRpc(accessToken, sessionId, {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: tool, arguments: args },
    });

    if (!response.ok) {
      return { ok: false, error: `http_${response.status}: ${text.slice(0, 500)}` };
    }

    const parsed = parseJsonRpcBody(text);
    if (!parsed) {
      return { ok: false, error: "invalid_response_body" };
    }
    if (parsed.error) {
      return { ok: false, error: `${parsed.error.code}: ${parsed.error.message}` };
    }

    const result = parsed.result;
    if (!result) {
      return { ok: false, error: "empty_result" };
    }
    if (result.isError) {
      const message = result.content?.find((c) => c.type === "text")?.text || "tool_error";
      return { ok: false, error: message };
    }
    if (result.structuredContent !== undefined) {
      return { ok: true, data: result.structuredContent as T };
    }
    const textContent = result.content?.find((c) => c.type === "text")?.text;
    if (textContent !== undefined) {
      try {
        return { ok: true, data: JSON.parse(textContent) as T };
      } catch {
        return { ok: true, data: textContent as unknown as T };
      }
    }
    return { ok: true, data: result as unknown as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unknown_error" };
  }
}
