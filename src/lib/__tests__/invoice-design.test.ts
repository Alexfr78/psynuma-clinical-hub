import { describe, expect, it } from 'vitest';
import {
  designFromCenter,
  diffDesign,
  effectiveColor,
  isDesignDirty,
  normalizeHexColor,
} from '@/lib/invoice-design';

const saved = designFromCenter({
  invoice_template: 'standard',
  invoice_footer: 'Pie  ',
  invoice_data_protection_text: null,
  bank_transfer_info: 'ES00 0000',
});

describe('normalizeHexColor', () => {
  it('acepta hex de 6 dígitos con o sin # y lo pasa a minúsculas', () => {
    expect(normalizeHexColor('#ABCDEF')).toBe('#abcdef');
    expect(normalizeHexColor('abcdef')).toBe('#abcdef');
  });
  it('rechaza el resto', () => {
    expect(normalizeHexColor('#abc')).toBeNull();
    expect(normalizeHexColor('red')).toBeNull();
    expect(normalizeHexColor(null)).toBeNull();
  });
});

describe('designFromCenter', () => {
  it('usa standard si el modelo falta o es desconocido', () => {
    expect(designFromCenter(null).invoice_template).toBe('standard');
    expect(designFromCenter({ invoice_template: 'otro' }).invoice_template).toBe('standard');
  });
  it('recorta textos y convierte vacíos en null', () => {
    expect(saved.invoice_footer).toBe('Pie');
    expect(designFromCenter({ invoice_footer: '   ' }).invoice_footer).toBeNull();
  });
});

describe('diffDesign', () => {
  it('no marca cambios por espacios o mayúsculas que se normalizan igual', () => {
    expect(isDesignDirty(saved, { ...saved, invoice_footer: ' Pie ' })).toBe(false);
  });
  it('devuelve solo los campos cambiados, ya normalizados', () => {
    const draft = { ...saved, invoice_template: 'formal' as const, invoice_primary_color: '#FF0000', invoice_footer: '' };
    expect(diffDesign(saved, draft)).toEqual({
      invoice_template: 'formal',
      invoice_primary_color: '#ff0000',
      invoice_footer: null,
    });
  });
});

describe('effectiveColor', () => {
  it('cae al color por defecto del modelo', () => {
    expect(effectiveColor(saved, 'primary')).toBe('#2563eb');
    expect(effectiveColor({ ...saved, invoice_template: 'formal' }, 'secondary')).toBe('#b0c0c9');
    expect(effectiveColor({ ...saved, invoice_primary_color: '#123456' }, 'primary')).toBe('#123456');
  });
});
