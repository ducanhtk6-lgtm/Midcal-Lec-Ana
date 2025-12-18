
import React from 'react';
import { UploadIcon, FileIcon, CloseIcon, DocumentChartBarIcon, ClockIcon, CubeIcon, SparklesIcon, InfoIcon } from './Icons';
import { TaskScale } from '../App';

interface InputFormProps {
  pdfFile: File | null;
  onFileChange: (file: File | null) => void;
  isParsing: boolean;
  script: string;
  onScriptChange: (script: string) => void;
  taskScale: TaskScale | null;
  isDeepAnalysisEnabled: boolean;
  onDeepAnalysisToggle: (enabled: boolean) => void;
  parsingProgress: { current: number; total: number } | null;
  forcedAnalysisPages: string;
  onForcedAnalysisPagesChange: (pages: string) => void;
  onlyAnalyzeForcedPages: boolean;
  onOnlyAnalyzeForcedPagesChange: (enabled: boolean) => void;
  onStartAnalysis: () => void;
  mainButtonText: string;
  isMainButtonDisabled: boolean;
  approvalCountdown: number | null;
}

const TaskScaleEstimation: React.FC<{ scale: TaskScale }> = ({ scale }) => (
    <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300">Task Scale Estimation</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
            <div>
                <DocumentChartBarIcon className="h-6 w-6 mx-auto text-sky-400 mb-1" />
                <p className="text-xs text-slate-400">Slides</p>
                <p className="text-lg font-bold text-white">{scale.slideCount}</p>
            </div>
            <div>
                <ClockIcon className="h-6 w-6 mx-auto text-sky-400 mb-1" />
                <p className="text-xs text-slate-400">Timestamps</p>
                <p className="text-lg font-bold text-white">{scale.timestampCount}</p>
            </div>
            <div>
                <CubeIcon className="h-6 w-6 mx-auto text-sky-400 mb-1" />
                <p className="text-xs text-slate-400">Est. Jobs</p>
                <p className="text-lg font-bold text-white" title={`Slices: ${scale.estimatedSlices}, Chunks: ${scale.estimatedChunks}`}>
                    {scale.estimatedSlices + scale.estimatedChunks}
                </p>
            </div>
        </div>
    </div>
);

const InputForm: React.FC<InputFormProps> = ({ 
    pdfFile, 
    onFileChange, 
    isParsing, 
    script, 
    onScriptChange, 
    taskScale, 
    isDeepAnalysisEnabled, 
    onDeepAnalysisToggle, 
    parsingProgress,
    forcedAnalysisPages,
    onForcedAnalysisPagesChange,
    onlyAnalyzeForcedPages,
    onOnlyAnalyzeForcedPagesChange,
    onStartAnalysis,
    mainButtonText,
    isMainButtonDisabled,
    approvalCountdown,
}) => {
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files ? event.target.files[0] : null;
        if (file) {
            onFileChange(file);
        }
    };

    const handleRemoveFile = () => {
        onFileChange(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };
    
    return (
        <div className="space-y-6">
            {taskScale && (
                <TaskScaleEstimation scale={taskScale} />
            )}
            <div>
                <label htmlFor="pdf-upload" className="block text-sm font-medium text-gray-300 mb-2">
                    1. Upload Slide Deck
                </label>
                {!pdfFile ? (
                    <label 
                        htmlFor="pdf-upload-input"
                        className="relative flex flex-col items-center justify-center w-full h-32 border-2 border-slate-700 border-dashed rounded-lg cursor-pointer bg-slate-900/50 hover:border-sky-500 hover:bg-slate-700/50 transition-all duration-300 group"
                    >
                        <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                            <UploadIcon className="w-8 h-8 mb-4 text-slate-500 group-hover:text-sky-400 transition-colors" />
                            <p className="mb-2 text-sm text-slate-400"><span className="font-semibold text-sky-400">Click to upload</span></p>
                            <p className="text-xs text-slate-500">PDF file only</p>
                        </div>
                        <input 
                            id="pdf-upload-input" 
                            type="file" 
                            className="hidden" 
                            accept="application/pdf"
                            onChange={handleFileSelect}
                            ref={fileInputRef}
                            disabled={isParsing}
                        />
                    </label>
                ) : (
                    <div className="flex items-center justify-between w-full p-3 pl-4 border border-slate-700 rounded-lg bg-slate-900/50">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <FileIcon className="h-8 w-8 text-sky-400 flex-shrink-0" />
                            <div className="flex flex-col overflow-hidden">
                                <span className="text-sm font-medium text-gray-200 truncate">{pdfFile.name}</span>
                                {isParsing || parsingProgress ? (
                                    <div className="text-xs text-yellow-400 flex items-center gap-1.5">
                                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        <span>
                                            {parsingProgress 
                                                ? `Analyzing page ${parsingProgress.current}/${parsingProgress.total}...`
                                                : 'Parsing PDF...'}
                                        </span>
                                    </div>
                                ) : approvalCountdown !== null ? (
                                    <span className="text-xs text-yellow-400 font-semibold">Pending Approval...</span>
                                ) : (
                                     <span className="text-xs text-green-400 font-semibold">Ready for analysis</span>
                                )}
                            </div>
                        </div>
                        <button 
                            onClick={handleRemoveFile} 
                            className="p-1.5 text-slate-400 rounded-full hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Remove file"
                            disabled={isParsing}
                        >
                            <CloseIcon className="w-5 h-5" />
                        </button>
                    </div>
                )}
            </div>

            <div className={`space-y-3 bg-slate-900/50 p-3 rounded-lg border border-slate-700 transition-opacity ${isParsing ? 'opacity-50' : ''}`}>
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <SparklesIcon className="w-5 h-5 text-sky-400" />
                        <label htmlFor="deep-analysis-toggle" className="text-sm font-medium text-gray-200 cursor-pointer">Deep Image Analysis</label>
                        <div className="group relative">
                            <InfoIcon className="w-4 h-4 text-slate-500" />
                            <span className="absolute bottom-full mb-2 w-64 left-1/2 -translate-x-1/2 bg-slate-900 text-slate-300 text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-slate-700 shadow-lg z-10">
                                Slower, but provides more accurate analysis by using AI to understand images and charts on each slide.
                            </span>
                        </div>
                    </div>
                    <button
                        id="deep-analysis-toggle"
                        role="switch"
                        aria-checked={isDeepAnalysisEnabled}
                        onClick={() => onDeepAnalysisToggle(!isDeepAnalysisEnabled)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:cursor-not-allowed ${isDeepAnalysisEnabled ? 'bg-sky-500' : 'bg-slate-600'}`}
                        disabled={isParsing}
                    >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isDeepAnalysisEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>
                 <div className={`transition-all duration-300 space-y-3 ${isDeepAnalysisEnabled ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                    <div>
                        <label htmlFor="force-analysis-pages" className="block text-xs font-medium text-slate-400 mb-1.5">
                            Force analysis on pages (optional)
                            <div className="group relative inline-block ml-1">
                                <InfoIcon className="w-3.5 h-3.5 text-slate-500" />
                                <span className="absolute bottom-full mb-2 w-64 left-1/2 -translate-x-1/2 bg-slate-900 text-slate-300 text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-slate-700 shadow-lg z-10">
                                    Force deep analysis on specific slides, like complex diagrams the system might miss. Use commas and dashes (e.g., 3, 5, 8-10).
                                </span>
                            </div>
                        </label>
                        <input
                            type="text"
                            id="force-analysis-pages"
                            value={forcedAnalysisPages}
                            onChange={(e) => onForcedAnalysisPagesChange(e.target.value)}
                            placeholder="e.g., 3, 5, 8-10"
                            className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm text-gray-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
                            disabled={isParsing || !isDeepAnalysisEnabled}
                        />
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
                        <label htmlFor="only-forced-toggle" className="text-xs font-medium text-slate-300 cursor-pointer flex items-center gap-1.5">
                            Only analyze forced pages
                             <div className="group relative">
                                <InfoIcon className="w-3.5 h-3.5 text-slate-500" />
                                <span className="absolute bottom-full mb-2 w-64 left-1/2 -translate-x-1/2 bg-slate-900 text-slate-300 text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-slate-700 shadow-lg z-10">
                                    <b>ON:</b> Only runs analysis on pages in the list.
                                    <br/>
                                    <b>OFF:</b> Runs analysis on pages with images AND pages in the list.
                                </span>
                            </div>
                        </label>
                        <button
                            id="only-forced-toggle"
                            role="switch"
                            aria-checked={onlyAnalyzeForcedPages}
                            onClick={() => onOnlyAnalyzeForcedPagesChange(!onlyAnalyzeForcedPages)}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:cursor-not-allowed ${onlyAnalyzeForcedPages ? 'bg-sky-500' : 'bg-slate-600'}`}
                            disabled={isParsing || !isDeepAnalysisEnabled}
                        >
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${onlyAnalyzeForcedPages ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>
                </div>
            </div>

            <div>
                <label htmlFor="script-input" className="block text-sm font-medium text-gray-300 mb-2">
                    2. Paste Lecture Script
                </label>
                <textarea
                    id="script-input"
                    value={script}
                    onChange={(e) => onScriptChange(e.target.value)}
                    rows={10}
                    placeholder={`Paste the entire timestamped lecture transcript here.
e.g.,
[00:15] Good morning everyone. Today we'll discuss...
[01:30] As you can see from the diagram, the pathophysiology involves...`}
                    className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-gray-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
                    disabled={isParsing}
                />
            </div>
             <button 
                onClick={onStartAnalysis}
                disabled={isMainButtonDisabled}
                className={`w-full mt-2 font-bold py-3 px-4 rounded-lg transition-all duration-300 shadow-lg disabled:cursor-not-allowed
                    ${approvalCountdown !== null 
                        ? 'bg-green-600 hover:bg-green-500 shadow-green-500/30' 
                        : 'bg-gradient-to-br from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-sky-500/30'}
                    disabled:from-gray-600 disabled:to-gray-700 disabled:shadow-none disabled:bg-none disabled:bg-gray-700
                `}
            >
                {mainButtonText}
            </button>
        </div>
    );
};

export default InputForm;
