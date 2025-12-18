import React, { useMemo, useState } from 'react';
import { DownloadIcon, CopyIcon, CheckIcon, DocumentChartBarIcon } from './Icons';

interface ResultDisplayProps {
  markdown: string;
  isLoading: boolean;
  error: string | null;
  onExport: () => void;
  step: 'idle' | 'segmentation' | 'final';
}

const MarkdownTable: React.FC<{ markdown: string, highlightRefined?: boolean }> = ({ markdown, highlightRefined = true }) => {
  const [copiedRowIndex, setCopiedRowIndex] = React.useState<number | null>(null);

  // Extract table lines (naive but sufficient for generated output)
  const lines = markdown.split('\n');
  
  // Filter out separator lines (e.g., |---| or | :--- |)
  const tableLines = lines.filter(line => {
      const trimmed = line.trim();
      // Must start and end with pipe
      if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
      
      // Remove pipes, spaces, colons, and dashes. If nothing remains, it's a separator line.
      const stripped = trimmed.replace(/[\|\s:\-]/g, '');
      return stripped.length > 0; 
  });

  if (tableLines.length < 1) return null;

  const headerLine = tableLines[0];
  const rowsLines = tableLines.slice(1);

  const parseRow = (rowLine: string) => {
      const content = rowLine.trim().replace(/^\||\|$/g, '');
      return content.split(/(?<!\\)\|/g).map(cell => cell.trim().replace(/\\\|/g, '|'));
  };
  
  const headers = parseRow(headerLine);
  const rows = rowsLines.map(parseRow);

  const refinedScriptColumnIndex = headers.findIndex(h => h.includes('Script đã Tinh chỉnh'));

  const handleCopy = (text: string, rowIndex: number) => {
    const textToCopy = text.replace(/<br\s*\/?>/gi, '\n');
    navigator.clipboard.writeText(textToCopy);
    setCopiedRowIndex(rowIndex);
    setTimeout(() => {
        setCopiedRowIndex(null);
    }, 2000);
  };


  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="min-w-full divide-y divide-slate-700">
        <thead className="bg-slate-800">
          <tr>
            {headers.map((header, i) => (
              <th key={i} scope="col" className="px-4 py-3.5 text-left text-sm font-semibold text-white">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 bg-slate-900/50">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-800/60 transition-colors">
                {row.map((cell, j) => (
                    <td key={j} className="px-4 py-4 text-sm text-slate-300 align-top relative group whitespace-pre-wrap">
                        <div dangerouslySetInnerHTML={{ __html: cell.replace(/<br\s*\/?>/gi, '<br />') }} />
                        {highlightRefined && j === refinedScriptColumnIndex && cell.trim() && cell.trim().toLowerCase() !== 'không áp dụng' && (
                            <button
                                onClick={() => handleCopy(cell, i)}
                                className="absolute top-2 right-2 p-1.5 rounded-md bg-slate-700/50 text-slate-300 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-200 hover:bg-slate-600/80"
                                aria-label="Copy script"
                            >
                                {copiedRowIndex === i ? (
                                <CheckIcon className="w-4 h-4 text-green-400" />
                                ) : (
                                <CopyIcon className="w-4 h-4" />
                                )}
                            </button>
                        )}
                    </td>
                ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const MarkdownViewer: React.FC<{ markdown: string, isSegmentation: boolean }> = ({ markdown, isSegmentation }) => {
    // Basic splitting to handle text before/after table
    const lines = markdown.split('\n');
    let inTable = false;
    let tableBuffer: string[] = [];
    const elements: React.ReactNode[] = [];

    const flushTable = (key: string) => {
        if (tableBuffer.length > 0) {
            elements.push(<MarkdownTable key={key} markdown={tableBuffer.join('\n')} highlightRefined={!isSegmentation} />);
            tableBuffer = [];
        }
    }

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        const isTableLine = trimmed.startsWith('|') && trimmed.endsWith('|');
        
        if (isTableLine) {
            if (!inTable) { // If we are entering a new table, flush any preceding text
                inTable = true;
            }
            tableBuffer.push(line);
        } else {
            if (inTable) {
                // Flush table
                flushTable(`table-${index}`);
                inTable = false;
            }
            if (trimmed) {
                 elements.push(<p key={`p-${index}`} className="mb-2 text-slate-300 whitespace-pre-wrap font-mono text-xs">{line}</p>);
            }
        }
    });
    
    // Flush remaining table
    flushTable('table-end');

    return <div className="space-y-4">{elements}</div>;
};

const LoadingSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-4">
    <div className="h-10 bg-slate-700 rounded w-full"></div>
    <div className="space-y-3">
      <div className="h-16 bg-slate-700 rounded"></div>
      <div className="h-16 bg-slate-700 rounded"></div>
      <div className="h-16 bg-slate-700 rounded"></div>
    </div>
  </div>
);


const ResultDisplay: React.FC<ResultDisplayProps> = ({ markdown, isLoading, error, onExport, step }) => {
  const hasResult = !isLoading && !error && markdown;
  const [isAllCopied, setIsAllCopied] = useState(false);

  const refinedScripts = useMemo(() => {
    if (!markdown || step !== 'final') return [];

    const lines = markdown.split('\n');
    const tableLines = lines.filter(line => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
      const stripped = trimmed.replace(/[\|\s:\-]/g, '');
      return stripped.length > 0;
    });

    if (tableLines.length < 2) return [];

    const headerLine = tableLines[0];
    const rowsLines = tableLines.slice(1);

    const parseRow = (rowLine: string) => {
      const content = rowLine.trim().replace(/^\||\|$/g, '');
      return content.split(/(?<!\\)\|/g).map(cell => cell.trim().replace(/\\\|/g, '|'));
    };

    const headers = parseRow(headerLine);
    const rows = rowsLines.map(parseRow);

    const refinedScriptColumnIndex = headers.findIndex(h => h.includes('Script đã Tinh chỉnh'));
    if (refinedScriptColumnIndex === -1) return [];

    return rows
      .map(row => row.length > refinedScriptColumnIndex ? row[refinedScriptColumnIndex] : '')
      .filter(cell => cell && cell.trim() && cell.trim().toLowerCase() !== 'không áp dụng');
  }, [markdown, step]);

  const handleCopyAll = () => {
    if (refinedScripts.length === 0) return;

    const allScriptsText = refinedScripts
      .map(cell => cell.replace(/<br\s*\/?>/gi, '\n'))
      .join('\n');

    navigator.clipboard.writeText(allScriptsText);
    setIsAllCopied(true);
    setTimeout(() => {
      setIsAllCopied(false);
    }, 2000);
  };

  return (
    <div className="bg-slate-800 p-6 rounded-xl shadow-2xl border border-slate-700 min-h-[300px] flex flex-col">
      <div className="flex justify-between items-start mb-6 gap-4">
        <h2 className="text-xl font-bold text-white flex-shrink-0">
            {step === 'segmentation' ? 'Segmentation Report' : 'Final Analysis Report'}
        </h2>
        {hasResult && step === 'final' && (
           <div className="flex items-center justify-end gap-2 flex-wrap">
                <button
                    onClick={handleCopyAll}
                    disabled={refinedScripts.length === 0}
                    className="flex items-center gap-2 text-sm bg-slate-600 hover:bg-slate-500/80 border border-slate-500/60 text-slate-200 font-semibold py-2 px-4 rounded-lg transition-colors disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed disabled:border-slate-600"
                >
                {isAllCopied ? (
                    <>
                    <CheckIcon className="h-5 w-5 text-green-400" />
                    <span>Copied All Scripts</span>
                    </>
                ) : (
                    <>
                    <CopyIcon className="h-5 w-5" />
                    <span>Copy All Scripts</span>
                    </>
                )}
                </button>
               <button 
                  onClick={onExport}
                  className="flex items-center gap-2 text-sm bg-sky-600/50 hover:bg-sky-500/50 border border-sky-500/60 text-sky-200 font-semibold py-2 px-4 rounded-lg transition-colors"
                  aria-label="Export to Word"
                >
                  <DownloadIcon className="h-5 w-5" />
                  Export to .docx
                </button>
           </div>
        )}
      </div>
      <div className="flex-grow">
        {isLoading && <LoadingSkeleton />}
        {error && (
          <div className="bg-red-900/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg">
            <h3 className="font-bold">An Error Occurred</h3>
            <p className="font-mono text-sm mt-1">{error}</p>
          </div>
        )}
        {hasResult && (
            <MarkdownViewer markdown={markdown} isSegmentation={step === 'segmentation'} />
        )}
        {!isLoading && !error && !markdown && (
           <div className="text-center text-slate-600 h-full flex flex-col justify-center items-center">
             <DocumentChartBarIcon className="h-16 w-16 mb-4" />
             <p className="font-semibold text-slate-400">Your analysis report will appear here.</p>
             <p className="text-sm">Provide inputs and start the pipeline to begin.</p>
           </div>
        )}
      </div>
    </div>
  );
};

export default ResultDisplay;