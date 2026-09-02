import { describe, it, expect } from "vitest";
import {
  resolveDayAvailability,
  type DayScheduleInput,
  type SlotConfig,
} from "../availability-core";

const CFG_60: SlotConfig = {
  durationMin: 60,
  stepMin: 60,
  minPublicDurationMin: 60,
};

const min = (h: number, m = 0) => h * 60 + m;

function starts(input: DayScheduleInput, cfg: SlotConfig = CFG_60): number[] {
  return resolveDayAvailability(input, cfg).map((s) => s.startMin);
}

describe("resolveDayAvailability", () => {
  it("caso 1: weekly simple sin busy → 10,11,12,13", () => {
    const input: DayScheduleInput = {
      mode: "weekly",
      weeklyWindows: [{ startMin: min(10), endMin: min(14) }],
      specialWindows: [],
      locationWindows: null,
      busy: [],
    };
    expect(starts(input)).toEqual([min(10), min(11), min(12), min(13)]);
  });

  it("caso 2: busy 11:00–12:00 → 10,12,13", () => {
    const input: DayScheduleInput = {
      mode: "weekly",
      weeklyWindows: [{ startMin: min(10), endMin: min(14) }],
      specialWindows: [],
      locationWindows: null,
      busy: [
        { startMin: min(11), endMin: min(12), source: "session", refId: "s1" },
      ],
    };
    expect(starts(input)).toEqual([min(10), min(12), min(13)]);
  });

  it("caso 3: mode closed → []", () => {
    const input: DayScheduleInput = {
      mode: "closed",
      weeklyWindows: [{ startMin: min(10), endMin: min(14) }],
      specialWindows: [],
      locationWindows: null,
      busy: [],
    };
    expect(starts(input)).toEqual([]);
  });

  it("caso 4: extended (merge weekly 10–14 + special 16–18)", () => {
    const input: DayScheduleInput = {
      mode: "extended",
      weeklyWindows: [{ startMin: min(10), endMin: min(14) }],
      specialWindows: [{ startMin: min(16), endMin: min(18) }],
      locationWindows: null,
      busy: [],
    };
    expect(starts(input)).toEqual([
      min(10), min(11), min(12), min(13),
      min(16), min(17),
    ]);
  });

  it("caso 5: location = [] (cerrado) → []", () => {
    const input: DayScheduleInput = {
      mode: "weekly",
      weeklyWindows: [{ startMin: min(10), endMin: min(14) }],
      specialWindows: [],
      locationWindows: [],
      busy: [],
    };
    expect(starts(input)).toEqual([]);
  });

  it("caso 6: location = null → ignora location", () => {
    const input: DayScheduleInput = {
      mode: "weekly",
      weeklyWindows: [{ startMin: min(10), endMin: min(14) }],
      specialWindows: [],
      locationWindows: null,
      busy: [],
    };
    expect(starts(input)).toEqual([min(10), min(11), min(12), min(13)]);
  });

  it("caso 6b: location con intervalo acota ventana", () => {
    const input: DayScheduleInput = {
      mode: "weekly",
      weeklyWindows: [{ startMin: min(9), endMin: min(18) }],
      specialWindows: [],
      locationWindows: [{ startMin: min(10), endMin: min(13) }],
      busy: [],
    };
    expect(starts(input)).toEqual([min(10), min(11), min(12)]);
  });

  it("caso 7: solapes complejos — varios busy cortan ventana", () => {
    const input: DayScheduleInput = {
      mode: "weekly",
      weeklyWindows: [{ startMin: min(9), endMin: min(18) }],
      specialWindows: [],
      locationWindows: null,
      busy: [
        { startMin: min(10), endMin: min(11), source: "session", refId: "a" },
        { startMin: min(10, 30), endMin: min(11, 30), source: "calendar", refId: "b" },
        { startMin: min(13), endMin: min(14), source: "exception", refId: "c" },
        { startMin: min(16), endMin: min(16, 30), source: "session", refId: "d" },
      ],
    };
    expect(starts(input)).toEqual([
      min(9), min(11, 30), min(14), min(15), min(16, 30),
    ]);
  });

  it("custom: reemplaza weekly por special", () => {
    const input: DayScheduleInput = {
      mode: "custom",
      weeklyWindows: [{ startMin: min(10), endMin: min(14) }],
      specialWindows: [{ startMin: min(16), endMin: min(19) }],
      locationWindows: null,
      busy: [],
    };
    expect(starts(input)).toEqual([min(16), min(17), min(18)]);
  });

  it("caso 8: serviceWindows null → ignora restricción de servicio", () => {
    const input: DayScheduleInput = {
      mode: "weekly",
      weeklyWindows: [{ startMin: min(10), endMin: min(14) }],
      specialWindows: [],
      locationWindows: null,
      serviceWindows: null,
      busy: [],
    };
    expect(starts(input)).toEqual([min(10), min(11), min(12), min(13)]);
  });

  it("caso 9: serviceWindows = [] → día cerrado para este servicio", () => {
    const input: DayScheduleInput = {
      mode: "weekly",
      weeklyWindows: [{ startMin: min(10), endMin: min(14) }],
      specialWindows: [],
      locationWindows: null,
      serviceWindows: [],
      busy: [],
    };
    expect(starts(input)).toEqual([]);
  });

  it("caso 10: serviceWindows acota dentro de weekly y location", () => {
    const input: DayScheduleInput = {
      mode: "weekly",
      weeklyWindows: [{ startMin: min(9), endMin: min(18) }],
      specialWindows: [],
      locationWindows: [{ startMin: min(9), endMin: min(21) }],
      serviceWindows: [{ startMin: min(10), endMin: min(12) }],
      busy: [],
    };
    expect(starts(input)).toEqual([min(10), min(11)]);
  });

  it("marca slots ancla (leftGap=0, rightGap=0) como isOptimal", () => {
    const input: DayScheduleInput = {
      mode: "weekly",
      weeklyWindows: [{ startMin: min(10), endMin: min(11) }],
      specialWindows: [],
      locationWindows: null,
      busy: [],
    };
    const slots = resolveDayAvailability(input, CFG_60);
    expect(slots.length).toBe(1);
    expect(slots[0].isOptimal).toBe(true);
  });
});
