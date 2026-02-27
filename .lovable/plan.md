

## Problem Analysis

The automated messages (reminders and notifications) ARE being sent via WasenderAPI and the API returns success (DB shows `status: sent`). However, these messages appear as **"Esperando mensaje. Esto puede tomar tiempo."** on your phone instead of showing the actual message content.

I verified this by cross-referencing timestamps:
- DB record: Gregorio reminder sent `2026-02-25 09:00:11 UTC` (10:00 Madrid) → Screenshot shows "Esperando mensaje" at 10:00
- DB record: Gregorio notification sent `2026-02-26 19:15:41 UTC` (20:15 Madrid) → Screenshot shows "Esperando mensaje" at 20:15

Meanwhile, manually sent messages (like the "Resumen Extendido" at 8:11) appear normally with blue checkmarks.

## Root Cause

After reviewing the WasenderAPI official documentation, I found a discrepancy: **all our functions send a `sessionId` field in the request body**, but the WasenderAPI `/api/send-message` endpoint does NOT accept this parameter. The correct format per the docs is:

```text
POST /api/send-message
Authorization: Bearer YOUR_API_KEY    ← The API key identifies the session
Body: { "to": "+34627946506", "text": "Hello" }   ← Only "to" and "text"
```

Our code sends:
```text
Body: { "sessionId": "60354", "to": "34627946506", "text": "Hello" }
```

The extra `sessionId` field is likely causing WasenderAPI to process the message differently (possibly routing it through an internal queue instead of the live WhatsApp Web session), which is why the API returns "success" but the messages appear as pending on the phone.

Additionally, the phone number format is inconsistent across functions: some use `+34...` (correct E.164) and others use `34...` (missing `+`).

## Fix

Remove the `sessionId` field from the request body and standardize phone format with `+` prefix in all four functions:

### 1. `supabase/functions/send-session-reminders/index.ts` (line 29-33)
```typescript
body: JSON.stringify({
  to: `+${cleanPhone}`,    // Add + prefix
  text: message,
  // Remove sessionId
}),
```

### 2. `supabase/functions/send-notification/index.ts` (line 232-236)
```typescript
body: JSON.stringify({
  to,                       // Already has + prefix
  text: message,
  // Remove sessionId
}),
```

### 3. `supabase/functions/wasender-send-message/index.ts` (lines 168-180)
```typescript
if (type === "image" && image_url) {
  messageBody = {
    to,                     // Already has + prefix
    mediaUrl: image_url,
    caption: caption || message,
    // Remove sessionId
  };
} else {
  messageBody = {
    to,                     // Already has + prefix
    text: message,
    // Remove sessionId
  };
}
```

### 4. `supabase/functions/wasender-send-reminders/index.ts` (line 256-260)
```typescript
body: JSON.stringify({
  to: `+${phone}`,         // Add + prefix (phone already has digits only)
  text: message,
  // Remove sessionId
}),
```

## Summary

- Remove `sessionId` from request body in 4 edge functions (not part of WasenderAPI spec)
- Standardize phone number format to E.164 (`+34...`) in all functions
- No database changes needed

