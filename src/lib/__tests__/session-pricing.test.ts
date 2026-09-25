import { describe, expect, it, vi } from 'vitest';
import { resolveSessionTypePrice } from '../../../supabase/functions/_shared/sessionPricing';

function clientReturning(data: unknown, error: unknown = null) {
  return { rpc: vi.fn().mockResolvedValue({ data, error }) };
}

const ARGS = { patientId: 'p1', sessionTypeId: 'st1', sessionDate: '2026-10-06', defaultPrice: 75 };

describe('resolveSessionTypePrice', () => {
  it('usa el precio personalizado del paciente y guarda su origen', async () => {
    const supabase = clientReturning({
      applied_price: 10, base_price: 75, pricing_source: 'custom', custom_price_id: 'cp1',
      tariff_plan_id: null, tariff_plan_assignment_id: null,
    });
    const result = await resolveSessionTypePrice(supabase, ARGS);
    expect(supabase.rpc).toHaveBeenCalledWith('resolve_effective_price', {
      p_patient_id: 'p1', p_target_type: 'session_type', p_target_id: 'st1', p_reference_date: '2026-10-06',
    });
    expect(result.price).toBe(10);
    expect(result.fields).toMatchObject({
      session_type_id: 'st1', price: 10, pricing_source: 'custom', base_price_snapshot: 75, custom_price_id: 'cp1',
    });
  });

  it('un precio personalizado de 0 € se respeta (no se cae al precio base)', async () => {
    const result = await resolveSessionTypePrice(
      clientReturning({ applied_price: 0, base_price: 75, pricing_source: 'custom', custom_price_id: 'cp0' }),
      ARGS,
    );
    expect(result.price).toBe(0);
  });

  it('si el resolvedor falla, mantiene el precio base', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await resolveSessionTypePrice(clientReturning(null, { message: 'boom' }), ARGS);
    expect(result.price).toBe(75);
    expect(result.fields.pricing_source).toBe('base');
    expect(result.fields.session_type_id).toBe('st1');
    spy.mockRestore();
  });
});
