import React, { useState } from 'react';
import { DashboardState, Stage, ModelName, JobStatus, AnalysisSubStage, WorkerJob, LogType, LectureChunk, LogEntry, AVAILABLE_MODELS } from '../types';
import { CpuChipIcon, ChartPieIcon, AnalyzeIcon, ScoreIcon, RefineIcon, CompileIcon, MergeIcon, InfoIcon, WarningIcon, ErrorIcon, CheckIcon, SparklesIcon } from './Icons';

interface DashboardProps {
  state: DashboardState;
  onApprove: () => void;
  onRetry: () => void;
  onExport: () => void;
  onSetModel: (stage: 'segmentation' | 'analysis' | 'image', model: ModelName) => void;
  onSetThinkingMode: (enabled: boolean) => void;
  onResumeAfterRateLimit: () => void;
}

const getStageDisplayName = (stage: Stage): string => {
    switch(stage) {
        case 'idle': return 'Idle';
        case 'segmentation': return 'Stage 1: Segmentation (Slicing)';
        case 'aggregating': return 'Stage 1: Segmentation (Aggregating)';
        case 'pending_approval': return 'Approval Required';
        case 'analysis': return 'Stage 2 & 3: Analysis';
        case 'completed': return 'Completed';
        default: return 'Unknown';
    }
}

const StatusIndicator: React.FC<{ stage: Stage, activeJobs: number, isCoolingDown: boolean, isPaused: boolean }> = ({ stage, activeJobs, isCoolingDown, isPaused }) => {
    let colorClasses = 'bg-yellow-500'; // idle, pending
    let glowClasses = 'shadow-yellow-500/40';
    if (isPaused) {
        colorClasses = 'bg-orange-500 animate-pulse';
        glowClasses = 'shadow-orange-500/50';
    } else if (isCoolingDown) {
        colorClasses = 'bg-red-500 animate-pulse';
        glowClasses = 'shadow-red-500/50';
    } else if (activeJobs > 0) {
        colorClasses = 'bg-sky-500 animate-pulse';
        glowClasses = 'shadow-sky-500/50';
    } else if (stage === 'completed') {
        colorClasses = 'bg-green-500';
        glowClasses = 'shadow-green-500/50';
    }
    
    return (
        <div className="flex items-center gap-3">
            <div className="relative">
                <div className={`h-3 w-3 rounded-full ${colorClasses}`}></div>
                <div className={`absolute top-0 left-0 h-3 w-3 rounded-full ${colorClasses} blur-sm ${glowClasses}`}></div>
            </div>
            <span className="text-lg font-bold text-white capitalize">
                {isPaused ? 'Paused (Rate Limit)' : getStageDisplayName(stage)}
            </span>
        </div>
    );
};

// Helper function for status styling
const getStatusClasses = (status: JobStatus) => {
    switch (status) {
        case 'processing':
            return 'bg-sky-500/20 border-sky-500/70 text-sky-300 animate-pulse';
        case 'completed':
            return 'bg-green-500/20 border-green-500/60 text-green-300';
        case 'failed':
            return 'bg-red-500/20 border-red-500/70 text-red-300';
        case 'pending':
        default:
            return 'bg-slate-700/50 border-slate-600/50 text-slate-400';
    }
};

const getQualityClasses = (classification: LectureChunk['qualityClassification']) => {
    switch (classification) {
        case 'Chất lượng cao':
            return 'border-green-400/80 bg-green-900/20 shadow-md shadow-green-900/20 text-green-300';
        case 'Trung bình':
            return 'border-sky-400/80 bg-sky-900/20 text-sky-300';
        case 'Chất lượng thấp':
            return 'border-slate-600 bg-slate-800/20 text-slate-400 opacity-90';
        default:
            return 'border-slate-700 bg-slate-800 text-slate-300';
    }
};


const subStageDisplayMap: Record<AnalysisSubStage, { text: string; icon: React.ReactNode }> = {
    queued: { text: 'Queued', icon: null },
    analyzing: { text: 'Analyzing', icon: <AnalyzeIcon className="w-3 h-3" /> },
    scoring: { text: 'Scoring', icon: <ScoreIcon className="w-3 h-3" /> },
    refining: { text: 'Refining', icon: <RefineIcon className="w-3 h-3" /> },
    compiling: { text: 'Compiling', icon: <CompileIcon className="w-3 h-3" /> },
};

const ChunkStatusDisplay: React.FC<{status: JobStatus, subStage: AnalysisSubStage}> = ({ status, subStage }) => {
    if (status === 'processing') {
        const display = subStageDisplayMap[subStage] || { text: 'Processing...', icon: null };
        return (
            <div className="flex items-center justify-center gap-1.5 text-[10px] opacity-90">
                {display.icon}
                <span className="capitalize">{display.text}</span>
            </div>
        )
    }
    return <div className="capitalize text-[10px] opacity-80">{status}</div>;
}

const Stage1Display: React.FC<{ jobs: WorkerJob[] }> = ({ jobs }) => {
    const sliceJobs = jobs.filter(j => j.type === 'slice_worker');
    const aggregatorJob = jobs.find(j => j.type === 'aggregator');

    const completedSlices = sliceJobs.filter(j => j.status === 'completed').length;
    const progress = sliceJobs.length > 0 ? (completedSlices / sliceJobs.length) * 100 : 0;

    return (
        <div className="flex flex-col h-full">
            {/* Progress Bar */}
            <div className="mb-4">
                <div className="flex justify-between mb-1">
                    <span className="text-xs font-medium text-sky-200">Slicer Progress</span>
                    <span className="text-xs font-medium text-sky-200">{completedSlices} / {sliceJobs.length}</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2.5">
                    <div className="bg-sky-500 h-2.5 rounded-full transition-all duration-500" style={{width: `${progress}%`}}></div>
                </div>
            </div>

            {/* Slicer Jobs Grid */}
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-4">
                {sliceJobs.map((job, index) => {
                    const { status, sliceId, jobId, error } = job;
                    const statusClasses = getStatusClasses(status);
                    let title = `Slice: ${sliceId}`;
                    if (status === 'failed' && error) {
                        title += `\nError: ${error}`;
                    }
                    return (
                        <div
                            key={jobId}
                            title={title}
                            className={`p-2 rounded-md border text-xs text-center transition-all duration-300 ${statusClasses}`}
                            style={{ animation: `fadeInUp 0.5s ease-out forwards`, animationDelay: `${index * 50}ms` }}
                        >
                            <div className="font-bold truncate">{sliceId}</div>
                            <div className="capitalize text-[10px] opacity-80">{status}</div>
                        </div>
                    );
                })}
            </div>

            {/* Aggregator Job */}
            {aggregatorJob && (
                <div className="mt-auto pt-4 border-t border-slate-700/50">
                    <div
                        title={`Aggregator Job\nStatus: ${aggregatorJob.status}`}
                        className={`p-3 rounded-lg border flex items-center gap-4 transition-all duration-300 ${getStatusClasses(aggregatorJob.status)}`}
                        style={{ animation: `fadeInUp 0.5s ease-out forwards`}}
                    >
                        <MergeIcon className="w-6 h-6 flex-shrink-0" />
                        <div>
                            <div className="font-bold">Aggregator</div>
                            <div className="capitalize text-xs opacity-80">{aggregatorJob.status}</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

const LogIcon: React.FC<{ type: LogType }> = ({ type }) => {
    switch (type) {
        case 'success': return <CheckIcon className="w-4 h-4 text-green-400 flex-shrink-0" />;
        case 'warning': return <WarningIcon className="w-4 h-4 text-yellow-400 flex-shrink-0" />;
        case 'error': return <ErrorIcon className="w-4 h-4 text-red-400 flex-shrink-0" />;
        case 'info':
        default: return <InfoIcon className="w-4 h-4 text-slate-500 flex-shrink-0" />;
    }
};

const LogItem: React.FC<{ log: LogEntry }> = ({ log }) => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    const colorClasses: Record<LogType, string> = {
        info: 'text-slate-400',
        success: 'text-green-300',
        warning: 'text-yellow-300',
        error: 'text-red-300',
    };
    return (
        <li className={`flex items-start gap-2.5 break-words leading-relaxed ${colorClasses[log.type]}`}>
            <LogIcon type={log.type} />
            <span className="flex-grow">
                <span className="font-mono text-slate-500 mr-2">{time}</span>
                {log.message}
            </span>
        </li>
    );
};

interface ErrorInfo { id: string; name: string; error?: string; }
const ErrorPanel: React.FC<{ errors: ErrorInfo[] }> = ({ errors }) => (
    <div className="bg-red-900/30 border border-red-500/40 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-3">
            <ErrorIcon className="w-6 h-6 text-red-300" />
            <h3 className="text-lg font-bold text-red-200">Errors Detected</h3>
        </div>
        <ul className="mt-3 space-y-2 text-sm text-red-200 font-mono list-disc list-inside">
            {errors.map(e => (
                <li key={e.id}>
                    <span className="font-bold">{e.name}:</span> {e.error || 'Unknown error'}
                </li>
            ))}
        </ul>
    </div>
);

const ThinkingModeToggle: React.FC<{ isEnabled: boolean, onChange: (enabled: boolean) => void, disabled: boolean }> = ({ isEnabled, onChange, disabled }) => {
    return (
        <div className={`flex items-center gap-2 transition-opacity ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <SparklesIcon className={`w-5 h-5 ${isEnabled ? 'text-sky-400' : 'text-slate-500'}`} />
            <span className={`text-xs font-semibold ${isEnabled ? 'text-sky-300' : 'text-slate-400'}`}>Thinking Mode</span>
            <button
                role="switch"
                aria-checked={isEnabled}
                onClick={() => !disabled && onChange(!isEnabled)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-800 ${isEnabled ? 'bg-sky-500' : 'bg-slate-600'}`}
                disabled={disabled}
            >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
        </div>
    );
}

const Dashboard: React.FC<DashboardProps> = ({ state, onApprove, onRetry, onExport, onSetModel, onSetThinkingMode, onResumeAfterRateLimit }) => {
  const { stage, activeJobs, maxConcurrency, isCoolingDown, cooldownRemaining, chunks, logs, finalMarkdown, jobQueue, segmentationReport, models, isThinkingMode, approvalCountdown, rateLimit } = state;

  const totalItems = stage === 'segmentation' || stage === 'aggregating' ? jobQueue.filter(j => j.type === 'slice_worker').length : chunks.length;
  const completedItems = stage === 'segmentation' || stage === 'aggregating'
    ? jobQueue.filter(j => j.type === 'slice_worker' && j.status === 'completed').length
    : chunks.filter(c => c.statusByStage.analysis === 'completed').length;
    
  const hasFailedJobs = jobQueue.some(j => j.status === 'failed') || chunks.some(c => c.statusByStage.analysis === 'failed');
  const showApproveButton = stage === 'pending_approval';
  const isProcessing = activeJobs > 0 || ['segmentation', 'aggregating', 'analysis'].includes(stage);

  // Check rate limit pause status for Analysis stage
  const isRateLimitPaused = rateLimit?.isPaused && rateLimit?.affectedStage === 'analysis';
  const failingModel = rateLimit?.failingModel;
  const canResume = isRateLimitPaused && models.analysis !== failingModel;

  const allErrors: ErrorInfo[] = [
    ...jobQueue.filter(j => j.status === 'failed').map(j => ({ id: j.jobId, name: j.sliceId || j.type, error: j.error })),
    ...chunks.filter(c => c.statusByStage.analysis === 'failed').map(c => ({ id: c.chunkId, name: c.chunkId, error: c.errorByStage.analysis }))
  ].filter(e => e.error);
  
  const approveButtonText = `Approve & Continue ${approvalCountdown !== null ? `(${approvalCountdown}s)` : ''}`.trim();


  return (
    <div className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 flex flex-col h-full">
      {/* 1. STATS BAR */}
      <div className="p-4 border-b border-slate-700 bg-slate-900/50 rounded-t-xl grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        <div className="md:col-span-1">
           <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Pipeline Status</h3>
           <StatusIndicator stage={stage} activeJobs={activeJobs} isCoolingDown={isCoolingDown} isPaused={!!rateLimit?.isPaused} />
        </div>
        
        <div className="md:col-span-2 flex justify-end gap-4">
            <div className="text-right p-3 rounded-lg bg-slate-800/50">
                <div className="flex items-center gap-2 justify-end">
                    <p className="text-xs text-slate-500">Concurrency</p>
                    <CpuChipIcon className="w-4 h-4 text-slate-500" />
                </div>
                <p className="font-mono font-bold text-sky-400 text-lg">
                    {activeJobs} / {maxConcurrency}
                </p>
                {isCoolingDown && <p className="text-xs text-red-400 font-semibold animate-pulse">COOLDOWN: {cooldownRemaining}s</p>}
            </div>
            <div className="text-right p-3 rounded-lg bg-slate-800/50">
                 <div className="flex items-center gap-2 justify-end">
                    <p className="text-xs text-slate-500">Progress</p>
                    <ChartPieIcon className="w-4 h-4 text-slate-500" />
                </div>
                <p className="font-mono font-bold text-white text-lg">{completedItems}/{totalItems || 'N/A'}</p>
            </div>
        </div>
      </div>

      {/* 2. MAIN CONTENT AREA (GRID / LOGS) */}
      <div className="flex-grow p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[300px]">
          <div className="lg:col-span-2 bg-slate-900/50 rounded-lg p-4 border border-slate-700/50 flex flex-col">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-xs text-slate-500 font-semibold tracking-wide">
                    {stage === 'segmentation' || stage === 'aggregating' ? 'STAGE 1: SEGMENTATION PIPELINE' : 'STAGE 2 & 3: CHUNK ANALYSIS MAP'}
                </h4>
                {stage !== 'segmentation' && stage !== 'aggregating' && (
                    <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-green-400"></span>
                            <span className="text-slate-400">High</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-sky-400"></span>
                            <span className="text-slate-400">Avg</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-slate-600"></span>
                            <span className="text-slate-400">Low</span>
                        </div>
                    </div>
                )}
              </div>

              {/* RATE LIMIT BANNER - PAUSE UI */}
              {isRateLimitPaused && (
                  <div className="bg-orange-900/30 border border-orange-500/40 rounded-lg p-4 mb-4 animate-[fadeInUp_0.3s_ease-out_forwards]">
                      <div className="flex items-start gap-3">
                          <WarningIcon className="w-6 h-6 text-orange-300 flex-shrink-0 mt-1" />
                          <div className="flex-grow">
                              <h3 className="text-lg font-bold text-orange-200">RATE_LIMIT_EXCEEDED detected</h3>
                              <p className="text-sm text-orange-200 mt-1">
                                  Model <b>{failingModel}</b> is overloaded. The pipeline is paused.
                              </p>
                              <div className="mt-2 text-sm text-orange-300">
                                  Action Required: Please switch <b>Chunk Analysis Model</b> below to a different model and click Resume.
                              </div>
                              <div className="mt-3 flex items-center gap-4">
                                  <div className="text-xs text-orange-400">
                                      Current Selection: <span className="font-bold text-white">{models.analysis}</span>
                                  </div>
                                  <button 
                                      onClick={onResumeAfterRateLimit}
                                      disabled={!canResume}
                                      className="bg-orange-600 hover:bg-orange-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-bold py-2 px-4 rounded transition-colors shadow-lg"
                                  >
                                      Resume (Retry Rate-Limited Jobs)
                                  </button>
                              </div>
                          </div>
                      </div>
                  </div>
              )}

              {allErrors.length > 0 && !isRateLimitPaused && <ErrorPanel errors={allErrors} />}
              
              <div className="flex-grow overflow-y-auto pr-2 -mr-2">
                 {(stage === 'segmentation' || stage === 'aggregating') ? (
                    jobQueue.length > 0 ? <Stage1Display jobs={jobQueue} /> : <p className="text-sm text-slate-500 italic flex items-center justify-center h-full">Waiting for slice jobs...</p>
                 ) : chunks.length > 0 ? (
                     <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                         {chunks.map((chunk) => {
                             const status = chunk.statusByStage.analysis;
                             const subStage = chunk.statusByStage.subStage;
                             const error = chunk.errorByStage.analysis;
                             
                             let statusClasses = getStatusClasses(status);
                             if (status === 'completed') {
                                statusClasses = getQualityClasses(chunk.qualityClassification);
                             }
                             
                             let title = `${chunk.chunkId} | ${chunk.slideRange}`;
                             if (chunk.qualityClassification) title += `\nQuality: ${chunk.qualityClassification}`;
                             if (status === 'failed' && error) {
                                 title += `\nError: ${error}`;
                             }

                             return (
                                 <div key={chunk.chunkId} title={title} className={`p-2 rounded-md border text-xs text-center transition-all duration-300 ${statusClasses}`} style={{ animation: `fadeInUp 0.5s ease-out forwards`, animationDelay: `${chunks.indexOf(chunk) * 30}ms`}}>
                                     <div className="font-bold truncate">{chunk.chunkId}</div>
                                     <ChunkStatusDisplay status={status} subStage={subStage} />
                                 </div>
                             )
                         })}
                     </div>
                 ) : (
                    <div className="text-center text-slate-500 h-full flex flex-col justify-center items-center">
                        <p className="text-sm">
                            {stage === 'completed' ? 'Processing finished.' : 'No chunks identified yet.'}
                        </p>
                    </div>
                 )}
              </div>
          </div>
          <div className="lg:col-span-1 bg-slate-900/50 rounded-lg p-4 border border-slate-700/50 flex flex-col">
              <h4 className="text-xs text-slate-500 mb-2 font-semibold tracking-wide">ACTIVITY LOG</h4>
              <ul className="space-y-2 overflow-y-auto flex-grow font-mono text-xs pr-2 -mr-2">
                  {logs.slice().reverse().map((log) => <LogItem key={log.id} log={log} />)}
                  {logs.length === 0 && <li className="italic text-slate-500">No activities yet...</li>}
              </ul>
          </div>
      </div>
      
      {/* 3. CONTROLS FOOTER */}
      <div className="p-4 border-t border-slate-700 bg-slate-900/50 rounded-b-xl flex flex-col md:flex-row items-center gap-4">
        <div className="flex-grow w-full">
            <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Controls & Configuration</h4>
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                    <label className="block text-xs text-slate-500 mb-1">Segmentation Model</label>
                    <select 
                        value={models.segmentation}
                        onChange={(e) => onSetModel('segmentation', e.target.value as ModelName)}
                        className="w-full bg-slate-800 border border-slate-600 text-xs text-gray-200 rounded-md px-2 py-1.5 focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                        disabled={stage !== 'idle'}
                    >
                        {AVAILABLE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                 <div className="flex-1">
                    <label className="block text-xs text-slate-500 mb-1">Image Analysis Model</label>
                    <select 
                        value={models.image}
                        onChange={(e) => onSetModel('image', e.target.value as ModelName)}
                        className="w-full bg-slate-800 border border-slate-600 text-xs text-gray-200 rounded-md px-2 py-1.5 focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                        disabled={stage !== 'idle'}
                    >
                        {AVAILABLE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <div className="flex-1">
                     <label className="block text-xs text-slate-500 mb-1">Chunk Analysis Model</label>
                     <select 
                         value={models.analysis}
                         onChange={(e) => onSetModel('analysis', e.target.value as ModelName)}
                         className="w-full bg-slate-800 border border-slate-600 text-xs text-gray-200 rounded-md px-2 py-1.5 focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition-opacity"
                         // ENABLED if stage is idle OR if we are currently paused due to rate limit to allow switching
                         disabled={stage === 'completed' || (isProcessing && !isRateLimitPaused) || (isThinkingMode && !isRateLimitPaused)}
                     >
                         {AVAILABLE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                     </select>
                </div>
                <div className="flex-shrink-0 flex items-end pb-1">
                     <ThinkingModeToggle isEnabled={isThinkingMode} onChange={onSetThinkingMode} disabled={stage === 'completed' || isProcessing}/>
                </div>
            </div>
        </div>
        <div className="flex-shrink-0 flex items-center gap-4 w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 border-slate-700">
            {hasFailedJobs && !isRateLimitPaused && (
            <button onClick={onRetry} className="text-sm font-semibold text-red-400 hover:text-red-300 underline transition-colors">
                Retry Failed
            </button>
            )}
            {showApproveButton && (
                <button 
                onClick={onApprove}
                disabled={activeJobs > 0}
                className="w-full md:w-auto bg-green-600 hover:bg-green-500 text-white font-bold py-2.5 px-6 rounded-lg transition disabled:bg-slate-600 shadow-lg hover:shadow-green-500/30"
                >
                    {approveButtonText}
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;