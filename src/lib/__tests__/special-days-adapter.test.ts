import { describe, it, expect } from "vitest";
import {
  buildDayScheduleInput,
  buildLocationWindows,
  pickApplicableSpecialDay,
  timeToMinutes,
  type RawSpecialDay,
  type RawScheduleException,
  type RawSession,
  type RawCalendarEvent,
  type RawAvailability,
  type RawLocationSchedule,
  type BuildDayInputArgs,
} from "../../../supabase/functions/_shared/special-days-adapter.ts";
import { resolveDayAvailability } from "../../../supabase/functions/_shared/availability-core.ts";

const PROF = "prof-1";
const DATE = "2026-04-20";

const baseArgs = (
  overrides: Partial<BuildDayInputArgs> = {},
): BuildDayInputArgs => ({
  date: DATE,
  professionalId: PROF,
  isPublicContext: true,
  weeklyAvailability: [
    { start_time: "10:00:00", end_time: "14:00:00" },
  ] as RawAvailability[],
  locationSchedules: null,
  specialDays: [],
  scheduleExceptions: [],
  sessions: [],
  calendarEvents: [],
  ...overrides,
});

describe("buildDayScheduleInput", () => {
  it("caso 1: sin special_days → mode weekly", () => {
    const input = buildDayScheduleInput(baseArgs());
    expect(input.mode).toBe("weekly");
    expect(input.weeklyWindows).toEqual([
      { startMin: timeToMinutes("10:00"), endMin: timeToMinutes("14:00") },
    ]);
    expect(input.specialWindows).toEqual([]);
  });

  it("caso 2: special_day center (custom) → usa special slots", () => {
    const sd: RawSpecialDay = {
      id: "sd1",
      scope: "center",
      professional_id: null,
      type: "custom",
      start_date: DATE,
      end_date: DATE,
      affects_public_booking: true,
      created_at: "2026-04-01T00:00:00Z",
      special_day_slots: [{ start_time: "16:00:00", end_time: "19:00:00" }],
    };
    const input = buildDayScheduleInput(baseArgs({ specialDays: [sd] }));
    expect(input.mode).toBe("custom");
    expect(input.specialWindows).toEqual([
      { startMin: timeToMinutes("16:00"), endMin: timeToMinutes("19:00") },
    ]);
  });

  it("caso 3: special_day professional tiene prioridad sobre center", () => {
    const center: RawSpecialDay = {
      id: "center",
      scope: "center",
      professional_id: null,
      type: "closed",
      start_date: DATE,
      end_date: DATE,
      affects_public_booking: true,
      created_at: "2026-04-01T00:00:00Z",
      special_day_slots: [],
    };
    const prof: RawSpecialDay = {
      id: "prof",
      scope: "professional",
      professional_id: PROF,
      type: "custom",
      start_date: DATE,
      end_date: DATE,
      affects_public_booking: true,
      created_at: "2026-04-01T00:00:00Z",
      special_day_slots: [{ start_time: "09:00:00", end_time: "12:00:00" }],
    };
    const picked = pickApplicableSpecialDay([center, prof], DATE, PROF, true);
    expect(picked?.id).toBe("prof");

    const input = buildDayScheduleInput(
      baseArgs({ specialDays: [center, prof] }),
    );
    expect(input.mode).toBe("custom");
    expect(input.specialWindows).toEqual([
      { startMin: timeToMinutes("09:00"), endMin: timeToMinutes("12:00") },
    ]);
  });

  it("caso 4: affects_public_booking=false en contexto público → se ignora", () => {
    const sd: RawSpecialDay = {
      id: "sd1",
      scope: "center",
      professional_id: null,
      type: "closed",
      start_date: DATE,
      end_date: DATE,
      affects_public_booking: false,
      created_at: "2026-04-01T00:00:00Z",
      special_day_slots: [],
    };
    const publicInput = buildDayScheduleInput(
      baseArgs({ specialDays: [sd], isPublicContext: true }),
    );
    expect(publicInput.mode).toBe("weekly");

    const internalInput = buildDayScheduleInput(
      baseArgs({ specialDays: [sd], isPublicContext: false }),
    );
    expect(internalInput.mode).toBe("closed");
  });

  it("caso 5: schedule_exceptions con affects_booking=false → NO bloquea", () => {
    const exc: RawScheduleException = {
      id: "exc1",
      scope: "center",
      professional_id: null,
      start_date: DATE,
      end_date: DATE,
      all_day: true,
      start_time: null,
      end_time: null,
      affects_booking: false,
    };
    const input = buildDayScheduleInput(
      baseArgs({ scheduleExceptions: [exc] }),
    );
    expect(input.busy).toEqual([]);
  });

  it("caso 5b: schedule_exceptions con affects_booking=true → bloquea", () => {
    const exc: RawScheduleException = {
      id: "exc1",
      scope: "center",
      professional_id: null,
      start_date: DATE,
      end_date: DATE,
      all_day: false,
      start_time: "11:00:00",
      end_time: "12:00:00",
      affects_booking: true,
    };
    const input = buildDayScheduleInput(
      baseArgs({ scheduleExceptions: [exc] }),
    );
    expect(input.busy).toHaveLength(1);
    expect(input.busy[0]).toMatchObject({
      startMin: timeToMinutes("11:00"),
      endMin: timeToMinutes("12:00"),
      source: "exception",
    });
  });

  it("un cierre general de día completo elimina todos los huecos públicos", () => {
    const closure: RawScheduleException = {
      id: "center-closed",
      scope: "center",
      professional_id: null,
      start_date: DATE,
      end_date: DATE,
      all_day: true,
      start_time: null,
      end_time: null,
      affects_booking: true,
    };
    const input = buildDayScheduleInput(baseArgs({
      locationSchedules: [
        { start_time: "09:00:00", end_time: "18:00:00", is_open: true },
      ],
      scheduleExceptions: [closure],
    }));

    expect(resolveDayAvailability(input, {
      durationMin: 60,
      stepMin: 30,
      minPublicDurationMin: 60,
    })).toEqual([]);
  });

  it("un día especial cerrado que afecta al portal elimina todos los huecos", () => {
    const closure: RawSpecialDay = {
      id: "special-closed",
      scope: "center",
      professional_id: null,
      type: "closed",
      start_date: DATE,
      end_date: DATE,
      affects_public_booking: true,
      created_at: "2026-04-01T00:00:00Z",
      special_day_slots: [],
    };
    const input = buildDayScheduleInput(baseArgs({
      locationSchedules: [
        { start_time: "09:00:00", end_time: "18:00:00", is_open: true },
      ],
      specialDays: [closure],
    }));

    expect(resolveDayAvailability(input, {
      durationMin: 60,
      stepMin: 30,
      minPublicDurationMin: 60,
    })).toEqual([]);
  });

  it("caso 7: calendar event bloquea correctamente", () => {
    const ev: RawCalendarEvent = {
      id: "ev1",
      start_at: "2026-04-20T09:00:00+02:00",
      end_at: "2026-04-20T10:30:00+02:00",
      status: "confirmed",
      all_day: false,
      is_converted: false,
      deleted: false,
    };
    const input = buildDayScheduleInput(
      baseArgs({ calendarEvents: [ev] }),
    );
    expect(input.busy).toHaveLength(1);
    expect(input.busy[0]).toMatchObject({
      startMin: timeToMinutes("09:00"),
      endMin: timeToMinutes("10:30"),
      source: "calendar",
      refId: "ev1",
    });
  });

  it("caso 7b: calendar event cancelado/convertido/borrado se ignora", () => {
    const base = {
      start_at: "2026-04-20T09:00:00+02:00",
      end_at: "2026-04-20T10:00:00+02:00",
      all_day: false,
    };
    const events: RawCalendarEvent[] = [
      { id: "a", ...base, status: "cancelled", is_converted: false, deleted: false },
      { id: "b", ...base, status: "confirmed", is_converted: true, deleted: false },
      { id: "c", ...base, status: "confirmed", is_converted: false, deleted: true },
    ];
    const input = buildDayScheduleInput(baseArgs({ calendarEvents: events }));
    expect(input.busy).toEqual([]);
  });

  it("sessions (TIME local) → busy con source=session", () => {
    const sessions: RawSession[] = [
      { id: "s1", start_time: "10:30:00", end_time: "11:30:00" },
    ];
    const input = buildDayScheduleInput(baseArgs({ sessions }));
    expect(input.busy).toHaveLength(1);
    expect(input.busy[0]).toMatchObject({
      startMin: timeToMinutes("10:30"),
      endMin: timeToMinutes("11:30"),
      source: "session",
      refId: "s1",
    });
  });
});

describe("buildLocationWindows", () => {
  it("null → sin restricción", () => {
    expect(buildLocationWindows(null)).toBeNull();
  });

  it("[] → cerrado (array vacío)", () => {
    expect(buildLocationWindows([])).toEqual([]);
  });

  it("rows con is_open=false/null → cerrado", () => {
    const rows: RawLocationSchedule[] = [
      { start_time: "10:00:00", end_time: "14:00:00", is_open: false },
      { start_time: "14:00:00", end_time: "18:00:00", is_open: null },
    ];
    expect(buildLocationWindows(rows)).toEqual([]);
  });

  it("rows con is_open=true → intervalos", () => {
    const rows: RawLocationSchedule[] = [
      { start_time: "10:00:00", end_time: "14:00:00", is_open: true },
      { start_time: "16:00:00", end_time: "19:00:00", is_open: true },
    ];
    expect(buildLocationWindows(rows)).toEqual([
      { startMin: timeToMinutes("10:00"), endMin: timeToMinutes("14:00") },
      { startMin: timeToMinutes("16:00"), endMin: timeToMinutes("19:00") },
    ]);
  });
});

describe("pickApplicableSpecialDay — desempate determinista", () => {
  it("dentro del mismo scope prioriza created_at más reciente", () => {
    const older: RawSpecialDay = {
      id: "A",
      scope: "center",
      professional_id: null,
      type: "closed",
      start_date: DATE,
      end_date: DATE,
      affects_public_booking: true,
      created_at: "2026-04-01T00:00:00Z",
      special_day_slots: [],
    };
    const newer: RawSpecialDay = {
      ...older,
      id: "B",
      created_at: "2026-04-10T00:00:00Z",
    };
    const picked = pickApplicableSpecialDay([older, newer], DATE, PROF, true);
    expect(picked?.id).toBe("B");
  });
});
