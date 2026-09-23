import { describe, expect, it } from "vitest";
import { classifyReply } from "../../../supabase/functions/_shared/whatsapp-reply-intent.ts";

describe("classifyReply", () => {
  it.each([
    ["Sí", "confirm"],
    ["sí.", "confirm"],
    [" OK ", "confirm"],
    ["si no puedo", "none"],
    ["ok pero llego tarde", "none"],
    ["1 hora más tarde", "none"],
    ["no", "none"],
    ["STOP", "opt_out"],
  ])("classifies %j as %s", (text, expected) => {
    expect(classifyReply(text)).toBe(expected);
  });
});
