import { describe, expect, it } from 'vitest'
import { parseCsv, parseCsvRecords, toCsv } from './csv'

describe('csv', () => {
  it('parses quoted fields with commas, escaped quotes and newlines', () => {
    const text = 'a,b,c\r\n1,"two, too","say ""hi"""\n3,"multi\nline",\n'
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'two, too', 'say "hi"'],
      ['3', 'multi\nline', ''],
    ])
  })

  it('strips an Excel BOM and skips blank lines', () => {
    expect(parseCsv('﻿x,y\n\n1,2')).toEqual([
      ['x', 'y'],
      ['1', '2'],
    ])
  })

  it('maps records by header with 1-based spreadsheet line numbers', () => {
    expect(parseCsvRecords('SKU, Name\nA1, Sofa\n')).toEqual([{ line: 2, record: { sku: 'A1', name: 'Sofa' } }])
  })

  it('neutralises spreadsheet formulas on export but leaves numbers alone', () => {
    const text = toCsv(['a', 'b', 'c', 'd'], [['=HYPERLINK("x")', '+1', -5, '@SUM(A1)']])
    expect(parseCsv(text)[1]).toEqual(["'=HYPERLINK(\"x\")", "'+1", '-5', "'@SUM(A1)"])
  })

  it('round-trips through toCsv', () => {
    const rows = [['S1', 'Gold, "Regal" Urn', 'line\nbreak', null]]
    const text = toCsv(['sku', 'name', 'notes', 'price'], rows)
    expect(parseCsv(text)).toEqual([['sku', 'name', 'notes', 'price'], ['S1', 'Gold, "Regal" Urn', 'line\nbreak', '']])
  })
})
