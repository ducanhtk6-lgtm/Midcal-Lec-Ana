import React, { useState, useEffect, useCallback, useRef } from 'react';
import InputForm from './components/InputForm';
import Dashboard from './components/Dashboard';
import { LogoIcon, UploadIcon, FileIcon, CloseIcon, ImageIcon, SparklesIcon } from './components/Icons';
import { useLecturePipeline } from './hooks/useLecturePipeline';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, AlignmentType, VerticalAlign } from 'docx';
import saveAs from 'file-saver';
import * as pdfjsLib from 'pdfjs-dist';
import ResultDisplay from './components/ResultDisplay';
import { SLICE_SIZE_TIMESTAMPS } from './hooks/useLecturePipeline';
import { analyzeImage, analyzeSlideImage } from './services/geminiService';
import { ModelName, AVAILABLE_MODELS, SlidePreview } from './types';
import LiveParsingView from './components/LiveParsingView';

// Configure PDF.js worker from CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

export interface TaskScale {
  slideCount: number;
  timestampCount: number;
  estimatedSlices: number;
  estimatedChunks: number;
}

type AppMode = 'lecture' | 'image';
type ParsingStatus = 'idle' | 'parsing' | 'pending_approval' | 'done';

const useWakeLock = (enabled: boolean) => {
    const sentinelRef = useRef<WakeLockSentinel | null>(null);

    useEffect(() => {
        if (!enabled) {
            if (sentinelRef.current) {
                sentinelRef.current.release().catch(console.error);
                sentinelRef.current = null;
            }
            return;
        }

        const requestWakeLock = async () => {
            try {
                if ('wakeLock' in navigator) {
                    const sentinel = await navigator.wakeLock.request('screen');
                    sentinelRef.current = sentinel;
                }
            } catch (err) {
                console.warn('Wake Lock request failed:', err);
            }
        };

        requestWakeLock();

        return () => {
            if (sentinelRef.current) {
                sentinelRef.current.release().catch(console.error);
                sentinelRef.current = null;
            }
        };
    }, [enabled]);
};

const fileToGenerativePart = async (file: File | Blob) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  const mimeType = file instanceof File ? file.type : 'image/jpeg';
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType },
  };
};

const parsePageRanges = (ranges: string): Set<number> => {
    const pageSet = new Set<number>();
    if (!ranges) return pageSet;

    const parts = ranges.split(',');
    for (const part of parts) {
        const trimmedPart = part.trim();
        if (trimmedPart.includes('-')) {
            const [start, end] = trimmedPart.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let i = start; i <= end; i++) {
                    pageSet.add(i);
                }
            }
        } else {
            const pageNum = Number(trimmedPart);
            if (!isNaN(pageNum)) {
                pageSet.add(pageNum);
            }
        }
    }
    return pageSet;
};


const ImageAnalyzer: React.FC = () => {
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [prompt, setPrompt] = useState<string>('');
    const [analysisResult, setAnalysisResult] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [imageModel, setImageModel] = useState<ModelName>('gemini-3-pro-preview');
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) setImageFile(file);
    };

    const handleRemoveFile = () => {
        setImageFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };
    
    const handleAnalyze = async () => {
        if (!imageFile || !prompt) return;
        setIsLoading(true);
        setError(null);
        setAnalysisResult('');
        try {
            const imagePart = await fileToGenerativePart(imageFile);
            const result = await analyzeImage(prompt, imagePart, imageModel);
            setAnalysisResult(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full flex flex-col md:flex-row gap-8">
            <div className="w-full md:w-[450px] md:flex-shrink-0">
                <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl shadow-2xl space-y-6 sticky top-24">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">1. Upload Image</label>
                        {!imageFile ? (
                             <label 
                                htmlFor="image-upload-input"
                                className="relative flex flex-col items-center justify-center w-full h-48 border-2 border-slate-700 border-dashed rounded-lg cursor-pointer bg-slate-900/50 hover:border-sky-500 hover:bg-slate-700/50 transition-all duration-300 group"
                            >
                                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                                    <UploadIcon className="w-8 h-8 mb-4 text-slate-500 group-hover:text-sky-400 transition-colors" />
                                    <p className="mb-2 text-sm text-slate-400"><span className="font-semibold text-sky-400">Click or drag</span></p>
                                    <p className="text-xs text-slate-500">PNG, JPG, WEBP</p>
                                </div>
                                <input id="image-upload-input" type="file" className="hidden" accept="image/*" onChange={handleFileChange} ref={fileInputRef} />
                            </label>
                        ) : (
                            <div className="relative">
                               <img src={URL.createObjectURL(imageFile)} alt="Preview" className="w-full h-auto max-h-60 object-contain rounded-lg border border-slate-600" />
                               <button onClick={handleRemoveFile} className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/80 transition-colors"><CloseIcon className="w-5 h-5" /></button>
                            </div>
                        )}
                    </div>
                     <div>
                        <label htmlFor="image-model" className="block text-sm font-medium text-gray-300 mb-2">2. Select Model</label>
                        <select 
                            id="image-model"
                            value={imageModel}
                            onChange={(e) => setImageModel(e.target.value as ModelName)}
                            className="w-full bg-slate-900 border border-slate-700 text-sm text-gray-200 rounded-md px-3 py-2.5 focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                            disabled={isLoading}
                        >
                            {AVAILABLE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="image-prompt" className="block text-sm font-medium text-gray-300 mb-2">3. Enter Prompt</label>
                        <textarea id="image-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} rows={5} placeholder="e.g., Describe the key findings in this medical image." className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-gray-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors" />
                    </div>
                    <button onClick={handleAnalyze} disabled={!imageFile || !prompt || isLoading} className="w-full mt-2 bg-gradient-to-br from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 shadow-lg hover:shadow-sky-500/30 disabled:shadow-none">
                        {isLoading ? 'Analyzing...' : 'Analyze Image'}
                    </button>
                </div>
            </div>
            <div className="w-full md:flex-1 min-w-0">
                <ResultDisplay markdown={analysisResult} isLoading={isLoading} error={error} onExport={() => {}} step="idle" />
            </div>
        </div>
    );
};


const App: React.FC = () => {
  const [slideContent, setSlideContent] = useState<string>('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [script, setScript] = useState<string>('');
  const [parsingStatus, setParsingStatus] = useState<ParsingStatus>('idle');
  const [parseError, setParseError] = useState<string | null>(null);
  const [taskScale, setTaskScale] = useState<TaskScale | null>(null);
  const [appMode, setAppMode] = useState<AppMode>('lecture');
  const [isDeepAnalysisEnabled, setIsDeepAnalysisEnabled] = useState<boolean>(true);
  const [parsingProgress, setParsingProgress] = useState<{ current: number; total: number } | null>(null);
  const [liveSlidePreviews, setLiveSlidePreviews] = useState<SlidePreview[]>([]);
  const [forcedAnalysisPages, setForcedAnalysisPages] = useState<string>('');
  const [onlyAnalyzeForcedPages, setOnlyAnalyzeForcedPages] = useState<boolean>(false);
  const [approvalCountdown, setApprovalCountdown] = useState<number>(60);

  const { state, startSegmentation, runStage2And3, retryAll, resumeAfterRateLimit, setModel, setThinkingMode } = useLecturePipeline();

  const isParsing = parsingStatus === 'parsing';
  const isPipelineActive = state.stage === 'segmentation' || state.stage === 'aggregating' || state.stage === 'analysis';
  
  // Request wake lock when processing to prevent sleep-induced timeouts
  useWakeLock(isParsing || isPipelineActive);

  const handleApproveAndStart = useCallback(() => {
    if (script && slideContent && parsingStatus === 'pending_approval') {
        setParsingStatus('done');
        const normalizedScript = normalizeScript(script);
        startSegmentation(slideContent, normalizedScript);
    }
  }, [script, slideContent, startSegmentation, parsingStatus]);

  useEffect(() => {
    if (parsingStatus === 'pending_approval') {
        setApprovalCountdown(60);
        const timer = setInterval(() => {
            setApprovalCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    handleApproveAndStart();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }
  }, [parsingStatus, handleApproveAndStart]);

  useEffect(() => {
    const calculateTaskScale = () => {
      if (!slideContent && !script) {
        setTaskScale(null);
        return;
      }
      
      const slideCount = (slideContent.match(/--- SLIDE \d+ ---/g) || []).length;
      
      const timestampRegex = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;
      const timestampCount = (script.match(timestampRegex) || []).length;

      const estimatedSlices = Math.ceil(timestampCount / SLICE_SIZE_TIMESTAMPS);
      const estimatedChunks = Math.max(estimatedSlices, Math.ceil(slideCount * 1.2));

      setTaskScale({
        slideCount,
        timestampCount,
        estimatedSlices,
        estimatedChunks
      });
    };

    const debounceTimer = setTimeout(calculateTaskScale, 300);
    return () => clearTimeout(debounceTimer);

  }, [slideContent, script]);

  const handleDeepAnalysisToggle = (enabled: boolean) => {
    setIsDeepAnalysisEnabled(enabled);
    if (!enabled) {
      setForcedAnalysisPages('');
      setOnlyAnalyzeForcedPages(false);
    }
  };

  const handleFileChange = async (file: File | null) => {
    if (!file) {
      setPdfFile(null);
      setSlideContent('');
      setParseError(null);
      setLiveSlidePreviews([]);
      setParsingStatus('idle');
      return;
    }

    setPdfFile(file);
    setParsingStatus('parsing');
    setParseError(null);
    setSlideContent('');
    setParsingProgress(null);
    setLiveSlidePreviews([]);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const typedArray = new Uint8Array(arrayBuffer);
      const pdf = await pdfjsLib.getDocument(typedArray).promise;
      const numPages = pdf.numPages;
      const allPreviews: SlidePreview[] = []; 
      const forcedPagesSet = parsePageRanges(forcedAnalysisPages);


      for (let i = 1; i <= numPages; i++) {
        setParsingProgress({ current: i, total: numPages });

        const initialPreview: SlidePreview = { slideNumber: i, textContent: 'Extracting text...', imageAnalysisContent: null, status: 'processing' };
        setLiveSlidePreviews(prev => [...prev, initialPreview]);
        
        const page = await pdf.getPage(i);
        
        const textContent = await page.getTextContent();
        const text = textContent.items.map(item => 'str' in item ? item.str : '').join(' ');
        setLiveSlidePreviews(prev => prev.map(p => p.slideNumber === i ? { ...p, textContent: text } : p));
        
        let imageAnalysis: string | null = null;
        if (isDeepAnalysisEnabled) {
          const operatorList = await page.getOperatorList();
          const hasImage = operatorList.fnArray.includes(pdfjsLib.OPS.paintImageXObject);
          const shouldForceAnalyze = forcedPagesSet.has(i);

          const shouldAnalyzeImage = onlyAnalyzeForcedPages
            ? shouldForceAnalyze // ON: Only analyze if forced
            : (hasImage || shouldForceAnalyze); // OFF: Analyze if it has an image OR is forced

          if (shouldAnalyzeImage) {
            setLiveSlidePreviews(prev => prev.map(p => p.slideNumber === i ? { ...p, imageAnalysisContent: 'Analyzing image...' } : p));
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            if (context) {
              await page.render({ canvasContext: context, viewport: viewport }).promise;
              const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
              
              if (blob) {
                const imagePart = await fileToGenerativePart(blob);
                imageAnalysis = await analyzeSlideImage(imagePart, state.models.image);
                setLiveSlidePreviews(prev => prev.map(p => p.slideNumber === i ? { ...p, imageAnalysisContent: imageAnalysis } : p));
              }
            }
          }
        }
        
        setLiveSlidePreviews(prev => prev.map(p => p.slideNumber === i ? { ...p, status: 'completed' } : p));

        allPreviews.push({
            slideNumber: i,
            textContent: text,
            imageAnalysisContent: imageAnalysis,
            status: 'completed',
        });
      }
      
      const finalContent = allPreviews.map(p => {
          let content = `--- SLIDE ${p.slideNumber} ---\n${p.textContent}`;
          const meaningfulAnalysis = p.imageAnalysisContent && 
                                   p.imageAnalysisContent !== 'Analyzing image...' &&
                                   !p.imageAnalysisContent.toLowerCase().includes('no significant visual content');

          if (meaningfulAnalysis) {
              content += `\n\n[IMAGE ANALYSIS]\n${p.imageAnalysisContent}\n[/IMAGE ANALYSIS]`;
          }
          return content;
      }).join('\n\n');

      setSlideContent(finalContent);
      setParsingStatus('pending_approval');
    } catch (err) {
      setParseError(err instanceof Error ? `Failed to parse PDF: ${err.message}` : 'An unknown error occurred during PDF parsing.');
      setPdfFile(null);
      setParsingStatus('idle');
    } finally {
      setParsingProgress(null);
    }
  };


  const normalizeScript = (rawScript: string): string => {
    const lines = rawScript.split('\n');
    const timestampRegex = /^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*$/;
    const isYouTubeFormat = lines.some(line => timestampRegex.test(line.trim()));
    if (!isYouTubeFormat) return rawScript;

    const normalizedBlocks: string[] = [];
    let currentTimestamp: string | null = null;
    let currentText: string[] = [];

    const flushBlock = () => {
        if (currentTimestamp && currentText.length > 0) {
            normalizedBlocks.push(`[${currentTimestamp}] ${currentText.join(' ').trim()}`);
            currentText = [];
        }
    };

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine === '') continue;

        const ytMatch = trimmedLine.match(timestampRegex);
        
        if (ytMatch) {
            flushBlock();
            currentTimestamp = ytMatch[1];
        } else {
            currentText.push(trimmedLine);
        }
    }
    flushBlock();
    return normalizedBlocks.join('\n');
  };

  
  const exportToWord = () => {
    const markdown = state.finalMarkdown;
    if (!markdown) return;

    const lines = markdown.split('\n').filter(l => l.trim().startsWith('|'));
    if (lines.length < 2) return;

    const parseRow = (rowLine: string) => rowLine.split(/(?<!\\)\|/).map(c => c.trim()).slice(1, -1);
    
    const headerCells = parseRow(lines[0]).map(text => new TableCell({
        children: [new Paragraph({
            children: [new TextRun({ text, bold: true })],
            alignment: AlignmentType.CENTER,
        })],
        verticalAlign: VerticalAlign.CENTER,
    }));

    const rows = lines.slice(2).map(line => {
      const cells = parseRow(line).map(cellText => {
        const paragraphs = cellText.split(/<br\s*\/?>/i).map(line => new Paragraph(line));
        return new TableCell({ children: paragraphs, verticalAlign: VerticalAlign.TOP });
      });
      return new TableRow({ children: cells });
    });

    const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({ children: headerCells, tableHeader: true }),
            ...rows
        ],
    });

    const doc = new Document({
        sections: [{
            children: [
                new Paragraph({
                    children: [new TextRun({ text: "Medical Lecture Analysis Report", size: 36, bold: true })],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 300 },
                }),
                table
            ],
        }],
    });

    Packer.toBlob(doc).then(blob => {
        saveAs(blob, "lecture-analysis-report.docx");
    });
  };
  
  const getMainButtonText = () => {
    if (parsingStatus === 'parsing') return 'Parsing PDF...';
    if (parsingStatus === 'pending_approval') return `Approve & Start Analysis (${approvalCountdown}s)`;
    if (state.stage === 'idle' && parsingStatus !== 'pending_approval') return 'Start Pipeline Analysis';
    if (state.stage === 'pending_approval') return 'Waiting for Approval';
    return 'Processing...';
  };

  const isMainButtonDisabled = 
    parsingStatus === 'parsing' ||
    !script || 
    !slideContent || 
    (state.stage !== 'idle' && parsingStatus === 'done');

  const handleStartButtonClick = () => {
      // Fix: Cast parsingStatus to ParsingStatus to prevent TypeScript from incorrect narrowing
      if ((parsingStatus as ParsingStatus) === 'pending_approval') {
          handleApproveAndStart();
      } else if (state.stage === 'idle' && script && slideContent) {
          setParsingStatus('done');
          const normalizedScript = normalizeScript(script);
          startSegmentation(slideContent, normalizedScript);
      }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-gray-100 font-sans flex flex-col">
      <header className="bg-slate-900/70 backdrop-blur-xl border-b border-slate-700 sticky top-0 z-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
                <div className="flex items-center gap-3">
                    <LogoIcon className="h-8 w-8 text-sky-400" />
                    <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                        Medical Lecture Analyzer
                    </h1>
                </div>
                <div className="flex items-center gap-2 p-1 rounded-lg bg-slate-800 border border-slate-700">
                    <button onClick={() => setAppMode('lecture')} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${appMode === 'lecture' ? 'bg-sky-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                       <SparklesIcon className="w-4 h-4 inline-block mr-2" />
                       Lecture Pipeline
                    </button>
                    <button onClick={() => setAppMode('image')} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${appMode === 'image' ? 'bg-sky-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                       <ImageIcon className="w-4 h-4 inline-block mr-2" />
                       Image Analyzer
                    </button>
                </div>
            </div>
        </div>
      </header>
      
      <main className="container mx-auto p-4 sm:p-6 lg:p-8 flex-grow">
        {appMode === 'lecture' ? (
             <div className="flex flex-col lg:flex-row gap-8">
                <div className="w-full lg:w-[450px] lg:flex-shrink-0">
                     <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl shadow-2xl space-y-6 sticky top-24">
                        <InputForm 
                            pdfFile={pdfFile}
                            onFileChange={handleFileChange}
                            isParsing={isParsing}
                            script={script}
                            onScriptChange={setScript}
                            taskScale={taskScale}
                            isDeepAnalysisEnabled={isDeepAnalysisEnabled}
                            onDeepAnalysisToggle={handleDeepAnalysisToggle}
                            parsingProgress={parsingProgress}
                            forcedAnalysisPages={forcedAnalysisPages}
                            onForcedAnalysisPagesChange={setForcedAnalysisPages}
                            onlyAnalyzeForcedPages={onlyAnalyzeForcedPages}
                            onOnlyAnalyzeForcedPagesChange={setOnlyAnalyzeForcedPages}
                            onStartAnalysis={handleStartButtonClick}
                            mainButtonText={getMainButtonText()}
                            isMainButtonDisabled={isMainButtonDisabled}
                            approvalCountdown={parsingStatus === 'pending_approval' ? approvalCountdown : null}
                        />
                        {parseError && <p className="text-red-400 text-sm mt-2">{parseError}</p>}
                     </div>
                </div>

                <div className="w-full lg:flex-1 min-w-0">
                     { parsingStatus === 'parsing' || parsingStatus === 'pending_approval' ? (
                        <LiveParsingView previews={liveSlidePreviews} isPendingApproval={parsingStatus === 'pending_approval'} />
                     ) : state.stage === 'idle' || state.stage === 'segmentation' || state.stage === 'aggregating' || state.stage === 'analysis' || state.stage === 'pending_approval' ? (
                         <Dashboard 
                            state={state}
                            onApprove={runStage2And3}
                            onRetry={retryAll}
                            onResumeAfterRateLimit={resumeAfterRateLimit}
                            onExport={exportToWord}
                            onSetModel={setModel}
                            onSetThinkingMode={setThinkingMode}
                         />
                     ) : null }
                     
                     {state.stage === 'pending_approval' && state.segmentationReport && (
                         <div className="mt-8">
                             <ResultDisplay 
                                markdown={state.segmentationReport}
                                isLoading={false}
                                error={null}
                                onExport={() => {}} // No export at this stage
                                step="segmentation"
                             />
                         </div>
                     )}

                     {state.stage === 'completed' && state.finalMarkdown && (
                         <div className="mt-8">
                            <ResultDisplay 
                                markdown={state.finalMarkdown}
                                isLoading={false}
                                error={null}
                                onExport={exportToWord}
                                step="final"
                             />
                         </div>
                     )}
                </div>
             </div>
        ) : (
            <ImageAnalyzer />
        )}
      </main>
    </div>
  );
};

export default App;