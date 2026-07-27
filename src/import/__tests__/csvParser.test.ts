import { detectDelimiter, parseCsv } from '../csvParser';

describe('detectDelimiter', () => {
  it('detects a comma header', () => {
    expect(detectDelimiter('a,b,c\r\n1,2,3\r\n')).toBe(',');
  });

  it('detects a semicolon header', () => {
    expect(detectDelimiter('a;b;c\r\n1;2;3\r\n')).toBe(';');
  });

  it('detects a tab header', () => {
    expect(detectDelimiter('a\tb\tc\r\n1\t2\t3\r\n')).toBe('\t');
  });

  it('ignores delimiters inside quoted header cells', () => {
    expect(detectDelimiter('"a;b;c;d";x\r\n')).toBe(';');
  });

  it('falls back to comma for a single-column file', () => {
    expect(detectDelimiter('only\r\nrow\r\n')).toBe(',');
  });

  it('falls back to comma when two candidates tie', () => {
    expect(detectDelimiter('a,b;c\r\n')).toBe(',');
  });

  it('only considers the header record', () => {
    expect(detectDelimiter('a,b\r\n1;2;3;4;5\r\n')).toBe(',');
  });
});

describe('parseCsv', () => {
  it('parses a simple header and rows', () => {
    const result = parseCsv('a,b,c\r\n1,2,3\r\n4,5,6\r\n');
    expect(result.header).toEqual(['a', 'b', 'c']);
    expect(result.delimiter).toBe(',');
    expect(result.rows).toEqual([
      { line: 2, cells: ['1', '2', '3'] },
      { line: 3, cells: ['4', '5', '6'] },
    ]);
  });

  it('strips a leading UTF-8 BOM', () => {
    const result = parseCsv('﻿a,b\r\n1,2\r\n');
    expect(result.header).toEqual(['a', 'b']);
    expect(result.rows[0].cells).toEqual(['1', '2']);
  });

  it('accepts LF line endings', () => {
    const result = parseCsv('a,b\n1,2\n');
    expect(result.header).toEqual(['a', 'b']);
    expect(result.rows).toEqual([{ line: 2, cells: ['1', '2'] }]);
  });

  it('honors quoted fields containing commas', () => {
    const result = parseCsv('a,b\r\n"x,y",z\r\n');
    expect(result.rows[0].cells).toEqual(['x,y', 'z']);
  });

  it('unescapes doubled quotes inside quoted fields', () => {
    const result = parseCsv('a\r\n"say ""hi"""\r\n');
    expect(result.rows[0].cells).toEqual(['say "hi"']);
  });

  it('preserves embedded newlines inside quoted fields and keeps the record line', () => {
    const result = parseCsv('a,b\r\n"line1\nline2",z\r\np,q\r\n');
    expect(result.rows[0].cells).toEqual(['line1\nline2', 'z']);
    expect(result.rows[1]).toEqual({ line: 4, cells: ['p', 'q'] });
  });

  it('handles a trailing field with no newline', () => {
    const result = parseCsv('a,b\r\n1,2');
    expect(result.rows[0].cells).toEqual(['1', '2']);
  });

  it('keeps trailing empty cells', () => {
    const result = parseCsv('a,b,c\r\n1,,\r\n');
    expect(result.rows[0].cells).toEqual(['1', '', '']);
  });

  it('skips blank lines', () => {
    const result = parseCsv('a,b\r\n1,2\r\n\r\n3,4\r\n');
    expect(result.rows).toEqual([
      { line: 2, cells: ['1', '2'] },
      { line: 4, cells: ['3', '4'] },
    ]);
  });

  it('returns empty header and rows for empty input', () => {
    const result = parseCsv('');
    expect(result.header).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('returns header only when there are no data rows', () => {
    const result = parseCsv('a,b,c\r\n');
    expect(result.header).toEqual(['a', 'b', 'c']);
    expect(result.rows).toEqual([]);
  });

  it('parses a semicolon-separated file without being told', () => {
    const result = parseCsv('a;b;c\r\n1;2;3\r\n');
    expect(result.delimiter).toBe(';');
    expect(result.header).toEqual(['a', 'b', 'c']);
    expect(result.rows[0].cells).toEqual(['1', '2', '3']);
  });

  it('honors quoted fields containing the detected delimiter', () => {
    const result = parseCsv('a;b\r\n"x;y";z\r\n');
    expect(result.rows[0].cells).toEqual(['x;y', 'z']);
  });

  it('respects an explicit delimiter over sniffing', () => {
    const result = parseCsv('a;b,c\r\n1;2,3\r\n', { delimiter: ',' });
    expect(result.delimiter).toBe(',');
    expect(result.rows[0].cells).toEqual(['1;2', '3']);
  });

  it('recovers UTF-16 text that was decoded as UTF-8', () => {
    const NUL = String.fromCharCode(0);
    const BOM_AS_UTF8 = String.fromCharCode(0xfffd).repeat(2);
    const utf16 = BOM_AS_UTF8 + 'a,b\r\n1,2\r\n'.split('').join(NUL);
    const result = parseCsv(utf16);
    expect(result.header).toEqual(['a', 'b']);
    expect(result.rows[0].cells).toEqual(['1', '2']);
  });
});
