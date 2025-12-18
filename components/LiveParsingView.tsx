
import React, { useEffect, useRef } from 'react';
import { SlidePreview } from '../types';
import { SparklesIcon, DocumentTextIcon, CheckIcon } from './Icons';

const LoadingSpinner: React.FC<{className?: string}> = ({ className = "w-4 h-4" }) => (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const SlidePreviewCard: React.FC<{ preview: SlidePreview }> = ({ preview }) => {
    return (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 animate-[fadeInUp_0.3s_ease-out_forwards]">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-700">
                <h3 className="font-bold text-lg text-white">Slide {preview.slideNumber}</h3>
                {preview.status === 'processing' ? (
                     <div className="flex items-center gap-2 text-xs text-yellow-400">
                        <LoadingSpinner />
                        <span>Processing...</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-xs text-green-400">
                        <CheckIcon className="w-4 h-4" />
                        <span>Completed</span>
                    </div>
                )}
            </div>
            <div className="space-y-4">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <DocumentTextIcon className="w-5 h-5 text-slate-400" />
                        <h4 className="text-sm font-semibold text-slate-300">Extracted Text</h4>
                    </div>
                    <p className="text-sm text-slate-400 whitespace-pre-wrap font-mono bg-slate-900/50 p-3 rounded-md">
                        {preview.textContent || 'No text content found.'}
                    </p>
                </div>
                {preview.imageAnalysisContent && (
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <SparklesIcon className="w-5 h-5 text-sky-400" />
                            <h4 className="text-sm font-semibold text-sky-300">Deep Image Analysis</h4>
                        </div>
                        <div className="text-sm text-sky-200 whitespace-pre-wrap font-mono bg-sky-900/20 border border-sky-500/30 p-3 rounded-md">
                            {preview.imageAnalysisContent === 'Analyzing image...' ? (
                                <span className="flex items-center gap-2 italic">
                                    <LoadingSpinner className="w-3 h-3"/> {preview.imageAnalysisContent}
                                </span>
                            ) : preview.imageAnalysisContent}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


interface LiveParsingViewProps {
    previews: SlidePreview[];
    isPendingApproval: boolean;
}

const LiveParsingView: React.FC<LiveParsingViewProps> = ({ previews, isPendingApproval }) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
    }, [previews]);

    return (
        <div className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 flex flex-col h-full">
            <div className="p-4 border-b border-slate-700 bg-slate-900/50 rounded-t-xl">
                <h2 className="text-xl font-bold text-white">
                    {isPendingApproval ? 'Analysis Complete - Pending Approval' : 'Live PDF Analysis'}
                </h2>
                <p className="text-sm text-slate-400">
                    {isPendingApproval 
                        ? 'Review the extracted content below. The pipeline will start automatically after the countdown.' 
                        : "Visualizing AI's real-time reading and analysis of each slide."}
                </p>
            </div>
            <div ref={scrollContainerRef} className="flex-grow p-4 space-y-4 overflow-y-auto bg-slate-900/30">
                {previews.map(preview => (
                    <SlidePreviewCard key={preview.slideNumber} preview={preview} />
                ))}
                {previews.length === 0 && (
                    <div className="text-center text-slate-500 h-full flex flex-col justify-center items-center">
                        <p className="text-sm">Waiting for PDF file to begin analysis...</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LiveParsingView;
