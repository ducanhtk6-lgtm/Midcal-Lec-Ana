import { LectureChunk } from '../types';
import { parseSegmentationReport } from './parsers';

// --- Helpers ---

/**
 * Converts a timestamp string (e.g., "01:30", "[1:15:20]") to seconds.
 */
const tsToSeconds = (ts: string): number => {
    const cleanTs = ts.replace(/[\[\]]/g, '').trim();
    const parts = cleanTs.split(':').map(Number);
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    }
    return 0;
};

/**
 * Extracts distinct timestamp strings from the full script to establish ground truth.
 */
const getGlobalTimestamps = (fullScript: string): string[] => {
    const timestampRegex = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;
    const matches = [...fullScript.matchAll(timestampRegex)];
    return matches.map(m => m[1]); // Return inner TS string, e.g. "05:00"
};

/**
 * Extracts markdown table blocks from text.
 * A block is defined as consecutive lines starting and ending with '|'.
 */
const extractMarkdownTableBlocks = (text: string): string[] => {
    const lines = text.split('\n');
    const tables: string[] = [];
    let currentTable: string[] = [];
    let inTable = false;

    for (const line of lines) {
        const trimmed = line.trim();
        const isTableLine = trimmed.startsWith('|') && trimmed.endsWith('|');

        if (isTableLine) {
            inTable = true;
            currentTable.push(trimmed);
        } else {
            if (inTable && currentTable.length >= 2) {
                // End of a table block
                tables.push(currentTable.join('\n'));
            }
            inTable = false;
            currentTable = [];
        }
    }
    // Flush last table if exists
    if (inTable && currentTable.length >= 2) {
        tables.push(currentTable.join('\n'));
    }

    return tables;
};

/**
 * Main function to aggregate worker reports deterministically.
 */
export const localAggregateWorkerReports = (workerReportsText: string, fullScript: string): string => {
    // 1. Establish Ground Truth
    const globalTimestamps = getGlobalTimestamps(fullScript);
    const globalTsSet = new Set(globalTimestamps);
    
    // 2. Parse Worker Outputs
    // We treat each table block as a mini-report and parse chunks from it
    const tableBlocks = extractMarkdownTableBlocks(workerReportsText);
    let allChunks: LectureChunk[] = [];

    for (const block of tableBlocks) {
        // Reuse existing parser. Note: parseSegmentationReport expects full MD, 
        // but it works fine if we pass just the table part.
        const chunks = parseSegmentationReport(block);
        allChunks = allChunks.concat(chunks);
    }

    if (allChunks.length === 0) {
        throw new Error("LOCAL_AGGREGATION_FAILED: No valid chunks parsed from worker reports.");
    }

    // 3. Sort & Merge
    // Sort chunks by the start time of their first timestamp
    allChunks.sort((a, b) => {
        const tA = a.tsList.length > 0 ? tsToSeconds(a.tsList[0]) : Infinity;
        const tB = b.tsList.length > 0 ? tsToSeconds(b.tsList[0]) : Infinity;
        return tA - tB;
    });

    // 4. Calculate Statistics & Integrity Checks
    const assignedTsList: string[] = []; // Flat list of all assigned TS
    const assignedTsSet = new Set<string>();
    let duplicateCount = 0;

    allChunks.forEach(chunk => {
        chunk.tsList.forEach(ts => {
            const cleanTs = ts.replace(/[\[\]]/g, '').trim();
            if (assignedTsSet.has(cleanTs)) {
                duplicateCount++;
            }
            assignedTsSet.add(cleanTs);
            assignedTsList.push(cleanTs);
        });
    });

    const totalCount = globalTimestamps.length;
    const assignedCount = assignedTsSet.size;
    const missingCount = Math.max(0, totalCount - assignedCount);

    // Order Check: The flattened list of assigned TS should match the global order relative to themselves
    // (Simplification: We just check if the sorted version of unique assigned matches global subset)
    // Ideally, we check strict order equality if coverage is 100%.
    
    let orderOk = 'YES';
    // If we have full coverage, check exact match
    if (missingCount === 0 && duplicateCount === 0) {
        // Normalize global for comparison
        const normGlobal = globalTimestamps.map(t => t.trim());
        const normAssigned = assignedTsList.map(t => t.trim());
        
        if (normGlobal.length !== normAssigned.length) {
            orderOk = 'NO';
        } else {
            for (let i = 0; i < normGlobal.length; i++) {
                if (normGlobal[i] !== normAssigned[i]) {
                    orderOk = 'NO';
                    break;
                }
            }
        }
    } else {
        // If missing/dup, order is technically compromised or N/A
        orderOk = 'NO'; 
    }

    // 5. Generate Mode A Markdown Report
    const header = `| Chunk_ID | Slide_Range | #Timestamps | Timestamp_Start–End | Flags(OCR_UNCERTAIN/MAP_UNCERTAIN) | Notes |`;
    const separator = `|---|---|---|---|---|---|`;
    
    const rows = allChunks.map(chunk => {
        const id = chunk.chunkId;
        const range = chunk.slideRange;
        const count = chunk.tsList.length;
        const startEnd = `${chunk.tsStart}–${chunk.tsEnd}`;
        const flags = chunk.flags.join(', ');
        // Ensure pipes are escaped in notes/content
        const notes = chunk.notes.replace(/\|/g, '\\|'); 
        
        return `| ${id} | ${range} | ${count} | ${startEnd} | ${flags} | ${notes} |`;
    });

    const summaryLine = `TOTAL_TIMESTAMPS = ${totalCount}; ASSIGNED = ${assignedCount}; MISSING = ${missingCount}; DUPLICATE = ${duplicateCount}; ORDER_OK = ${orderOk}`;

    return [header, separator, ...rows, '', summaryLine].join('\n');
};
