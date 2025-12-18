import { LectureChunk } from '../types';

/**
 * Parses the Mode A Segmentation Report to extract chunks and metadata.
 * Expects the Notes column to contain "TS_LIST=[...]"
 */
export const parseSegmentationReport = (markdown: string): LectureChunk[] => {
  const chunks: LectureChunk[] = [];
  const lines = markdown.split('\n');
  
  const tableLines = lines.filter(line => line.trim().startsWith('|') && line.trim().endsWith('|'));
  if (tableLines.length < 3) return []; // Header, Separator, Data

  // Filter out separator lines
  const dataLines = tableLines.filter(line => {
      const stripped = line.replace(/[\|\s:\-]/g, '');
      return stripped.length > 0; 
  }).slice(1); // Also remove header

  dataLines.forEach((line, index) => {
    const cells = line.split(/(?<!\\)\|/).map(c => c.trim()).slice(1, -1); // Remove outer empty cells
    
    if (cells.length < 6) return;

    const [chunkId, slideRange, , tsRangeRaw, flagsRaw, notes] = cells;

    const tsListMatch = notes.match(/TS_LIST=\[([^\]]+)\]/);
    const tsList = tsListMatch ? tsListMatch[1].split(',').map(t => t.trim().replace(/^\[|\]$/g, '')) : [];

    const [tsStart, tsEnd] = tsRangeRaw.split(/[-–]/).map(s => s.trim());

    chunks.push({
      chunkId: chunkId.replace(/^\|/, '').trim(),
      slideRange,
      tsList,
      tsStart: tsStart || (tsList.length > 0 ? tsList[0] : ''),
      tsEnd: tsEnd || (tsList.length > 0 ? tsList[tsList.length - 1] : ''),
      flags: flagsRaw.split(',').map(f => f.trim()).filter(f => f),
      notes,
      statusByStage: {
        analysis: 'pending',
        subStage: 'queued',
      },
      resultByStage: {},
      errorByStage: {},
      attempts: 0
    });
  });

  return chunks;
};

/**
 * Merges multiple Mode B Markdown tables into one, robustly handling headers.
 */
export const mergeModeBTables = (tableSegments: string[]): string => {
  if (!tableSegments || tableSegments.length === 0) return '';

  let finalHeader = '';
  let finalSeparator = '';
  const allRows: string[] = [];

  for (const segment of tableSegments) {
    if (!segment) continue;
    const lines = segment.split('\n').map(l => l.trim()).filter(l => l.startsWith('|') && l.endsWith('|'));
    
    if (lines.length < 2) continue; // Not a valid table segment

    const header = lines[0];
    const separator = lines[1];
    const rows = lines.slice(2);

    if (!finalHeader) {
      finalHeader = header;
      finalSeparator = separator;
    }
    
    allRows.push(...rows);
  }

  if (!finalHeader) return ''; // No valid tables found

  return [finalHeader, finalSeparator, ...allRows].join('\n');
};
