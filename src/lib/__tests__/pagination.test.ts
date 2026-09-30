import { describe, expect, it } from 'vitest';
import { clampPage, isPageSize, pageRange, pageWindow, totalPages } from '@/lib/pagination';

describe('pageRange', () => {
  it('devuelve el tramo inclusivo de PostgREST', () => {
    expect(pageRange(0, 10)).toEqual({ from: 0, to: 9 });
    expect(pageRange(2, 50)).toEqual({ from: 100, to: 149 });
  });
  it('no admite páginas negativas', () => {
    expect(pageRange(-1, 10)).toEqual({ from: 0, to: 9 });
  });
});

describe('totalPages / clampPage', () => {
  it('siempre hay al menos una página', () => {
    expect(totalPages(0, 10)).toBe(1);
    expect(totalPages(101, 50)).toBe(3);
  });
  it('recoloca la página si el total se reduce', () => {
    expect(clampPage(5, 30, 10)).toBe(2);
    expect(clampPage(0, 0, 10)).toBe(0);
  });
});

describe('isPageSize', () => {
  it('solo acepta 10, 50 o 100', () => {
    expect(isPageSize(50)).toBe(true);
    expect(isPageSize(25)).toBe(false);
    expect(isPageSize('50')).toBe(false);
  });
});

describe('pageWindow', () => {
  it('muestra todas si son pocas', () => {
    expect(pageWindow(0, 4)).toEqual([0, 1, 2, 3]);
  });
  it('recorta con elipsis a ambos lados', () => {
    expect(pageWindow(10, 20)).toEqual([0, null, 9, 10, 11, null, 19]);
  });
  it('sin elipsis inicial cerca del principio', () => {
    expect(pageWindow(1, 20)).toEqual([0, 1, 2, null, 19]);
  });
  it('sin elipsis final cerca del final', () => {
    expect(pageWindow(19, 20)).toEqual([0, null, 18, 19]);
  });
});
