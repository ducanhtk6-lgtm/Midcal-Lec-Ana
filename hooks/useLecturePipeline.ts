import { useReducer, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { parseSegmentationReport, mergeModeBTables } from '../utils/parsers';
import { localAggregateWorkerReports } from '../utils/localAggregator';
import { runPipelineStep, runChunkAnalysis, extractScriptForChunk, extractSlidesForChunk } from '../services/geminiService';
import { DashboardState, WorkerJob, LectureChunk, Stage, ModelName, AnalysisSubStage, LogEntry } from '../types';

// --- Constants ---
const MAX_CONCURRENCY_DEFAULT = 5;
const COOLDOWN_SECONDS = 60;
export const SLICE_SIZE_TIMESTAMPS = 50; // Slice size based on number of timestamps
const SLICE_CONTEXT_TIMESTAMPS = 3;  // Overlap for context
const SUBSTAGE_PROGRESSION: AnalysisSubStage[] = ['analyzing', 'scoring', 'refining', 'compiling'];

// --- Helpers ---
const generateId = () => uuidv4();

const createLog = (type: LogEntry['type'], message: string): LogEntry => ({
    id: generateId(),
    type,
    message,
    timestamp: new Date().toISOString()
});

const parseClassificationFromResult = (markdown: string): LectureChunk['qualityClassification'] => {
    try {
        const lines = markdown.split('\n').filter(l => l.trim().startsWith('|'));
        if (lines.length < 3) return undefined;
        
        const headers = lines[0].split('|').map(h => h.trim());
        const classificationIndex = headers.findIndex(h => h.includes('Phân loại'));

        if (classificationIndex === -1) return undefined;

        const dataRow = lines[2].split('|').map(d => d.trim());
        const classification = dataRow[classificationIndex];

        if (classification.includes('Chất lượng cao')) return 'Chất lượng cao';
        if (classification.includes('Trung bình')) return 'Trung bình';
        if (classification.includes('Chất lượng thấp')) return 'Chất lượng thấp';

        return undefined;
    } catch (e) {
        console.error("Failed to parse classification:", e);
        return undefined;
    }
};


// --- Reducer Actions ---
type Action =
  | { type: 'START_SEGMENTATION'; jobs: WorkerJob[] }
  | { type: 'ADD_JOB_TO_QUEUE'; job: WorkerJob }
  | { type: 'START_JOB'; jobId: string }
  | { type: 'COMPLETE_JOB'; jobId: string; result: string }
  | { type: 'FAIL_JOB'; jobId: string; error: string }
  | { type: 'AGGREGATOR_SUCCESS'; report: string; chunks: LectureChunk[] }
  | { type: 'START_ANALYSIS'; jobs: WorkerJob[] }
  | { type: 'ADVANCE_CHUNK_SUBSTAGE'; chunkId: string }
  | { type: 'CHUNK_ANALYSIS_SUCCESS'; chunkId: string; result: string }
  | { type: 'CHUNK_ANALYSIS_FAILURE'; chunkId: string; error: string }
  | { type: 'FINALIZE_PIPELINE'; markdown: string }
  | { type: 'TRIGGER_COOLDOWN' }
  | { type: 'COOLDOWN_TICK' }
  | { type: 'END_COOLDOWN' }
  | { type: 'RETRY_ALL_FAILED' }
  | { type: 'SET_MODEL'; stage: 'segmentation' | 'analysis' | 'image'; model: ModelName }
  | { type: 'SET_THINKING_MODE'; enabled: boolean }
  | { type: 'APPROVAL_COUNTDOWN_TICK' }
  | { type: 'RESET' }
  | { type: 'PAUSE_FOR_MODEL_SWITCH'; stage: 'segmentation' | 'analysis'; model: ModelName }
  | { type: 'RESUME_AFTER_MODEL_SWITCH' }
  | { type: 'RETRY_RATE_LIMITED' };

// --- Initial State ---
const initialState: DashboardState = {
  stage: 'idle',
  maxConcurrency: MAX_CONCURRENCY_DEFAULT,
  activeJobs: 0,
  isCoolingDown: false,
  cooldownRemaining: 0,
  models: {
    segmentation: 'gemini-2.5-flash',
    analysis: 'gemini-2.5-pro',
    image: 'gemini-3-pro-preview'
  },
  isThinkingMode: false,
  jobQueue: [],
  chunks: [],
  logs: [],
  segmentationReport: '',
  finalMarkdown: '',
  approvalCountdown: null,
  rateLimit: {
    isPaused: false,
    affectedStage: null,
    failingModel: null,
    switchAttempted: false
  }
};

// --- Reducer Logic ---
const pipelineReducer = (state: DashboardState, action: Action): DashboardState => {
  switch (action.type) {
    case 'START_SEGMENTATION':
      return {
        ...state,
        stage: 'segmentation',
        jobQueue: action.jobs,
        logs: [...state.logs, createLog('info', `Stage 1: Slicing complete. ${action.jobs.length} worker jobs created.`)],
      };
    
    case 'ADD_JOB_TO_QUEUE':
      return {
          ...state,
          stage: 'aggregating',
          jobQueue: [...state.jobQueue, action.job],
          logs: [...state.logs, createLog('info', `Stage 1: All slice workers finished. Starting aggregator job.`)],
      };

    case 'START_JOB': {
      let updatedChunks = state.chunks;
      const job = state.jobQueue.find(j => j.jobId === action.jobId);
      if (job?.type === 'chunk_analysis' && job.chunkId) {
          updatedChunks = state.chunks.map(c => 
              c.chunkId === job.chunkId 
              ? { ...c, statusByStage: { analysis: 'processing', subStage: 'analyzing' } }
              : c
          );
      }
      return {
        ...state,
        activeJobs: state.activeJobs + 1,
        jobQueue: state.jobQueue.map(j =>
          j.jobId === action.jobId ? { ...j, status: 'processing', startedAt: Date.now(), attempt: j.attempt + 1 } : j
        ),
        chunks: updatedChunks,
      };
    }

    case 'COMPLETE_JOB': {
      const job = state.jobQueue.find(j => j.jobId === action.jobId);
      const jobIdentifier = job?.type === 'aggregator' ? 'Aggregator' : job?.sliceId || `Job ${job?.jobId.slice(0,5)}`;
      const logMsg = `${jobIdentifier} completed successfully.`;
      return {
        ...state,
        activeJobs: state.activeJobs - 1,
        logs: [...state.logs, createLog('success', logMsg)],
        jobQueue: state.jobQueue.map(j =>
          j.jobId === action.jobId ? { ...j, status: 'completed', completedAt: Date.now(), result: action.result } : j
        ),
      };
    }
      
    case 'FAIL_JOB': {
        const job = state.jobQueue.find(j => j.jobId === action.jobId);
        const jobIdentifier = job?.type === 'aggregator' ? 'Aggregator' : job?.sliceId || job?.chunkId || `Job ${job?.jobId.slice(0,5)}`;
        const logMsg = `${jobIdentifier} failed. Error: ${action.error}`;
        return {
          ...state,
          activeJobs: state.activeJobs - 1,
          logs: [...state.logs, createLog('error', logMsg)],
          jobQueue: state.jobQueue.map(j =>
            j.jobId === action.jobId ? { ...j, status: 'failed', error: action.error } : j
          ),
        };
    }

    case 'AGGREGATOR_SUCCESS':
      return {
        ...state,
        stage: 'pending_approval',
        approvalCountdown: 60,
        jobQueue: [], 
        activeJobs: 0,
        segmentationReport: action.report,
        chunks: action.chunks,
        logs: [...state.logs, createLog('success', `Stage 1: Aggregator finished. Parsed ${action.chunks.length} chunks. Waiting for user approval.`)],
      };
      
    case 'START_ANALYSIS':
        return {
          ...state,
          stage: 'analysis',
          jobQueue: action.jobs,
          finalMarkdown: '',
          approvalCountdown: null,
          logs: [...state.logs, createLog('info', `Stage 2 & 3: Starting analysis for ${action.jobs.length} chunks.`)],
          chunks: state.chunks.map(c => ({...c, statusByStage: { analysis: 'pending', subStage: 'queued' }}))
        };

    case 'ADVANCE_CHUNK_SUBSTAGE': {
        const chunkToAdvance = state.chunks.find(c => c.chunkId === action.chunkId);
        if (!chunkToAdvance || chunkToAdvance.statusByStage.analysis !== 'processing') {
            return state; // Don't advance if not processing or already done
        }
        const currentSubStageIndex = SUBSTAGE_PROGRESSION.indexOf(chunkToAdvance.statusByStage.subStage);
        if (currentSubStageIndex >= SUBSTAGE_PROGRESSION.length - 1) {
            return state; // Already at the last sub-stage, do nothing
        }
        const nextSubStage = SUBSTAGE_PROGRESSION[currentSubStageIndex + 1];
        return {
            ...state,
            chunks: state.chunks.map(c => 
                c.chunkId === action.chunkId 
                ? { ...c, statusByStage: { ...c.statusByStage, subStage: nextSubStage } } 
                : c
            ),
        };
    }
        
    case 'CHUNK_ANALYSIS_SUCCESS': {
        const chunk = state.chunks.find(c => c.chunkId === action.chunkId);
        const classification = parseClassificationFromResult(action.result);
        const logMsg = `Chunk ${chunk?.chunkId} analysis completed.`;
        return {
            ...state,
            logs: [...state.logs, createLog('success', logMsg)],
            chunks: state.chunks.map(c => 
                c.chunkId === action.chunkId 
                ? { ...c, resultByStage: { ...c.resultByStage, analysis: action.result }, statusByStage: { analysis: 'completed', subStage: 'queued' }, qualityClassification: classification }
                : c
            )
        };
    }
        
    case 'CHUNK_ANALYSIS_FAILURE': {
        const chunk = state.chunks.find(c => c.chunkId === action.chunkId);
        const logMsg = `Chunk ${chunk?.chunkId} analysis failed. Error: ${action.error}`;
        return {
            ...state,
            logs: [...state.logs, createLog('error', logMsg)],
            chunks: state.chunks.map(c => 
                c.chunkId === action.chunkId 
                ? { ...c, errorByStage: { ...c.errorByStage, analysis: action.error }, statusByStage: { analysis: 'failed', subStage: 'queued' } }
                : c
            )
        };
    }
        
    case 'FINALIZE_PIPELINE':
        return {
            ...state,
            stage: 'completed',
            finalMarkdown: action.markdown,
            jobQueue: [],
            logs: [...state.logs, createLog('success', `Pipeline finished. Final report generated.`)],
        };

    case 'TRIGGER_COOLDOWN':
      return { 
          ...state, 
          isCoolingDown: true, 
          maxConcurrency: 1, 
          cooldownRemaining: COOLDOWN_SECONDS, 
          logs: [...state.logs, createLog('warning', `Rate limit hit. Triggering ${COOLDOWN_SECONDS}s cooldown.`)] 
      };

    case 'COOLDOWN_TICK':
      return { ...state, cooldownRemaining: Math.max(0, state.cooldownRemaining - 1) };

    case 'END_COOLDOWN':
      return { 
          ...state, 
          isCoolingDown: false, 
          maxConcurrency: MAX_CONCURRENCY_DEFAULT, 
          // Reset switchAttempted to allow a fresh start after cooldown
          rateLimit: state.rateLimit ? { ...state.rateLimit, switchAttempted: false } : undefined,
          logs: [...state.logs, createLog('info', `Cooldown finished. Resuming normal operations.`)] 
      };
      
    case 'RETRY_ALL_FAILED':
        return {
            ...state,
            jobQueue: state.jobQueue.map(j => j.status === 'failed' ? {...j, status: 'pending', error: undefined} : j),
            chunks: state.chunks.map(c => c.statusByStage.analysis === 'failed' ? {...c, statusByStage: { analysis: 'pending', subStage: 'queued' }, errorByStage: {}} : c),
            logs: [...state.logs, createLog('info', `Retrying all failed jobs.`)]
        };
        
    case 'SET_MODEL':
        return {
            ...state,
            models: {
                ...state.models,
                [action.stage]: action.model
            }
        };

    case 'SET_THINKING_MODE':
      return {
        ...state,
        isThinkingMode: action.enabled,
        models: action.enabled
            ? { ...state.models, analysis: 'gemini-3-pro-preview' }
            : state.models
      };
      
    case 'APPROVAL_COUNTDOWN_TICK':
        return {
            ...state,
            approvalCountdown: state.approvalCountdown !== null ? Math.max(0, state.approvalCountdown - 1) : null,
        };

    case 'RESET':
        return initialState;

    case 'PAUSE_FOR_MODEL_SWITCH':
        return {
            ...state,
            rateLimit: {
                isPaused: true,
                affectedStage: action.stage,
                failingModel: action.model,
                switchAttempted: false
            },
            logs: [...state.logs, createLog('warning', `RATE_LIMIT_EXCEEDED on ${action.model}. Please switch model to continue.`)]
        };

    case 'RESUME_AFTER_MODEL_SWITCH':
        return {
            ...state,
            rateLimit: {
                ...state.rateLimit!,
                isPaused: false,
                switchAttempted: true,
            },
            logs: [...state.logs, createLog('info', 'Model switched. Retrying rate-limited jobs...')]
        };

    case 'RETRY_RATE_LIMITED':
        return {
            ...state,
            // Retry jobs that failed specifically due to RATE_LIMIT_EXCEEDED
            jobQueue: state.jobQueue.map(j => 
                (j.status === 'failed' && j.error === 'RATE_LIMIT_EXCEEDED') 
                ? { ...j, status: 'pending', error: undefined } 
                : j
            ),
            // Retry chunks that failed specifically due to RATE_LIMIT_EXCEEDED
            chunks: state.chunks.map(c => 
                (c.statusByStage.analysis === 'failed' && c.errorByStage.analysis === 'RATE_LIMIT_EXCEEDED')
                ? { ...c, statusByStage: { analysis: 'pending', subStage: 'queued' }, errorByStage: { ...c.errorByStage, analysis: undefined } }
                : c
            )
        };

    default:
      return state;
  }
};

export const useLecturePipeline = () => {
  const [state, dispatch] = useReducer(pipelineReducer, initialState);
  
  const stateRef = useRef(state);
  const fullContentRef = useRef<{ slideContent: string, script: string }>({ slideContent: '', script: '' });
  const cooldownTimerRef = useRef<number | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  
  const setModel = useCallback((stage: 'segmentation' | 'analysis' | 'image', model: ModelName) => {
      dispatch({ type: 'SET_MODEL', stage, model });
  }, []);
  
  const setThinkingMode = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_THINKING_MODE', enabled });
  }, []);

  const startSegmentation = useCallback((slideContent: string, fullScript: string) => {
    fullContentRef.current = { slideContent, script: fullScript };
    
    const timestampRegex = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;
    const allTimestampsWithIndices = [...fullScript.matchAll(timestampRegex)].map(m => ({ ts: m[0], index: m.index! }));

    if (allTimestampsWithIndices.length === 0) {
      console.warn("No timestamps found in script!");
      return;
    }

    const slices: WorkerJob[] = [];
    for (let i = 0; i < allTimestampsWithIndices.length; i += SLICE_SIZE_TIMESTAMPS) {
      const sliceStart = i;
      const sliceEnd = Math.min(i + SLICE_SIZE_TIMESTAMPS, allTimestampsWithIndices.length);
      
      const contextStart = Math.max(0, sliceStart - SLICE_CONTEXT_TIMESTAMPS);
      const contextEnd = Math.min(allTimestampsWithIndices.length, sliceEnd + SLICE_CONTEXT_TIMESTAMPS);
      
      const ownedTimestamps = allTimestampsWithIndices.slice(sliceStart, sliceEnd).map(t => t.ts);
      const contextTimestamps = allTimestampsWithIndices.slice(contextStart, contextEnd).map(t => t.ts);
      
      const scriptStartIndex = allTimestampsWithIndices[contextStart].index;
      const scriptEndIndex = (contextEnd < allTimestampsWithIndices.length) ? allTimestampsWithIndices[contextEnd].index : fullScript.length;
      
      const scriptSlice = fullScript.substring(scriptStartIndex, scriptEndIndex);
      
      const sliceId = `S${(slices.length + 1).toString().padStart(2, '0')}`;
      const payload = `
<EXECUTION_MODE>WORKER</EXECUTION_MODE>
<SLICE_ID>${sliceId}</SLICE_ID>
<OWNED_TIMESTAMPS>${ownedTimestamps.join(', ')}</OWNED_TIMESTAMPS>
<CONTEXT_TIMESTAMPS>${contextTimestamps.join(', ')}</CONTEXT_TIMESTAMPS>
<SLIDE_SUBDECK>${slideContent}</SLIDE_SUBDECK>
<SCRIPT_SLICE>${scriptSlice}</SCRIPT_SLICE>
<INSTRUCTION_WRAPPER>You MUST format the "Notes" column with: TS_LIST=[...]</INSTRUCTION_WRAPPER>`;
      
      slices.push({
        jobId: generateId(), type: 'slice_worker', stage: 'segmentation', payload, sliceId,
        status: 'pending', attempt: 0, createdAt: Date.now()
      });
    }
    dispatch({ type: 'START_SEGMENTATION', jobs: slices });
  }, []);

  const runStage2And3 = useCallback(() => {
    const { slideContent, script } = fullContentRef.current;
    const currentChunks = stateRef.current.chunks;
    
    if (currentChunks.length === 0) {
        console.warn("Attempted to start Stage 2/3 with no chunks.");
        return;
    }

    try {
        const analysisJobs: WorkerJob[] = currentChunks.map(chunk => {
        const chunkScript = extractScriptForChunk(script, chunk);
        const chunkSlides = extractSlidesForChunk(slideContent, chunk);
        
        if (!chunkScript) {
             console.warn(`Chunk ${chunk.chunkId} has empty script content. Analysis might fail.`);
        }

        const payload = `
<SLIDE_DECK>${chunkSlides}</SLIDE_DECK>
<FULL_SCRIPT>${chunkScript}</FULL_SCRIPT>
<INSTRUCTION_WRAPPER>Perform analysis for this specific chunk.</INSTRUCTION_WRAPPER>`;
        
        return {
            jobId: generateId(), type: 'chunk_analysis', stage: 'analysis', chunkId: chunk.chunkId, payload,
            status: 'pending', attempt: 0, createdAt: Date.now()
        };
        });
        
        dispatch({ type: 'START_ANALYSIS', jobs: analysisJobs });
    } catch (e: any) {
        console.error(`Error creating analysis jobs: ${e.message}`);
    }
  }, []); 
  
  const retryAll = useCallback(() => {
    dispatch({ type: 'RETRY_ALL_FAILED' });
  }, []);

  const resumeAfterRateLimit = useCallback(() => {
      dispatch({ type: 'RETRY_RATE_LIMITED' });
      dispatch({ type: 'RESUME_AFTER_MODEL_SWITCH' });
  }, []);

  // --- MAIN SCHEDULER LOOP (UPDATED TO USE WEB WORKER) ---
  useEffect(() => {
    const processNextJob = async () => {
      const currentState = stateRef.current; // ALWAYS read from ref

      // STOP if paused due to rate limit switch request
      if (currentState.rateLimit?.isPaused) return;

      // Halt processing during approval phase or cooldown
      if (currentState.stage === 'pending_approval' || currentState.isCoolingDown || currentState.activeJobs >= currentState.maxConcurrency) return;

      const nextJob = currentState.jobQueue.find(j => j.status === 'pending');
      if (!nextJob) return;

      let modelAttempted: ModelName | null = null;
      dispatch({ type: 'START_JOB', jobId: nextJob.jobId });
      
      try {
        // SELECT MODEL BASED ON STAGE
        const currentModel = nextJob.stage === 'segmentation' || nextJob.stage === 'aggregating' 
            ? currentState.models.segmentation 
            : currentState.models.analysis;

        // Capture which model we are attempting to use to ensure accurate error reporting
        modelAttempted = currentModel;

        // SPECIAL HANDLING FOR AGGREGATOR TO AVOID TIMEOUTS
        if (nextJob.type === 'aggregator') {
             try {
                 const fullScript = fullContentRef.current.script;
                 // Extract worker reports from payload
                 const match = nextJob.payload.match(/<WORKER_REPORTS>([\s\S]*?)<\/WORKER_REPORTS>/);
                 const workerReports = match ? match[1] : '';
                 
                 // Run deterministic local aggregation
                 const result = localAggregateWorkerReports(workerReports, fullScript);
                 dispatch({ type: 'COMPLETE_JOB', jobId: nextJob.jobId, result });
                 return; // Exit successfully without calling API
             } catch (localError: any) {
                 console.warn(`Local aggregation failed (${localError.message}). Falling back to API.`);
                 // Proceed to fall through to API call logic below...
             }
        }

        const result = nextJob.type === 'chunk_analysis'
          ? await runChunkAnalysis(nextJob.payload, currentModel, currentState.isThinkingMode)
          : await runPipelineStep(nextJob.payload, currentModel);

        if (nextJob.type === 'chunk_analysis') {
            dispatch({ type: 'CHUNK_ANALYSIS_SUCCESS', chunkId: nextJob.chunkId!, result });
        }
        dispatch({ type: 'COMPLETE_JOB', jobId: nextJob.jobId, result });
      } catch (err: any) {
        console.error(`Job ${nextJob.jobId} failed: ${err.message}`);
        if ((err as any).raw) {
            console.warn("Rate limit raw error:", (err as any).raw);
        }
        
        if (err.message === 'RATE_LIMIT_EXCEEDED') {
            // New logic: Check if we are in analysis stage and haven't tried switching yet
            const isAnalysisStage = nextJob.stage === 'analysis';
            const rateLimitState = currentState.rateLimit;
            
            // If in analysis stage and haven't attempted a switch in this cycle (or first time)
            if (isAnalysisStage && (!rateLimitState || (!rateLimitState.switchAttempted && !rateLimitState.isPaused))) {
                 // Determine current failing model - use the one we actually attempted!
                 const failingModel = modelAttempted || currentState.models.analysis;
                 dispatch({ type: 'PAUSE_FOR_MODEL_SWITCH', stage: 'analysis', model: failingModel });
                 // NOTE: We do NOT trigger cooldown here. We just fail this job and pause the queue.
            } else {
                 // Fallback: If not analysis, or we ALREADY tried switching and failed again
                 dispatch({ type: 'TRIGGER_COOLDOWN' });
            }
        }

        if (nextJob.type === 'chunk_analysis') {
            dispatch({ type: 'CHUNK_ANALYSIS_FAILURE', chunkId: nextJob.chunkId!, error: err.message });
        }
        dispatch({ type: 'FAIL_JOB', jobId: nextJob.jobId, error: err.message });
      }
    };
    
    // Create a Blob Worker to handle the interval on a separate thread
    // This prevents the browser from throttling the interval when the tab is in the background
    const workerBlob = new Blob([
        `self.onmessage = function(e) {
            if (e.data === 'start') {
                self.intervalId = setInterval(function() {
                    self.postMessage('tick');
                }, 500);
            } else if (e.data === 'stop') {
                clearInterval(self.intervalId);
            }
        };`
    ], { type: 'text/javascript' });

    const worker = new Worker(URL.createObjectURL(workerBlob));
    
    worker.onmessage = () => {
        processNextJob();
    };
    
    worker.postMessage('start');
    
    return () => {
        worker.postMessage('stop');
        worker.terminate();
    };
  }, []); 
  
  // Aggregator & Finalization Effect
  useEffect(() => {
    // Stage 1: Check if all slice workers are done to trigger aggregator
    if (state.stage === 'segmentation') {
      const workers = state.jobQueue.filter(j => j.type === 'slice_worker');
      const allWorkersDone = workers.length > 0 && workers.every(j => j.status === 'completed' || j.status === 'failed');
      const aggregatorExists = state.jobQueue.some(j => j.type === 'aggregator');

      if (allWorkersDone && !aggregatorExists) {
        // Optimization: Compact reports by only keeping table lines to reduce token usage if fallback needed
        const workerReports = workers
            .filter(j => j.status === 'completed' && j.result)
            .map(j => {
                const lines = (j.result || '').split('\n');
                // Keep lines that look like table rows or potential headers
                return lines.filter(l => l.trim().startsWith('|') && l.trim().endsWith('|')).join('\n');
            })
            .join('\n\n');
        
        if (workerReports.length > 0) {
            const aggJob: WorkerJob = {
              jobId: generateId(), type: 'aggregator', stage: 'aggregating', status: 'pending', attempt: 0, createdAt: Date.now(),
              payload: `<EXECUTION_MODE>AGGREGATOR</EXECUTION_MODE><WORKER_REPORTS>${workerReports}</WORKER_REPORTS>`
            };
            dispatch({ type: 'ADD_JOB_TO_QUEUE', job: aggJob });
        } else {
            dispatch({ type: 'FAIL_JOB', jobId: 'aggregator-creation', error: 'All slice workers failed, cannot aggregate.' });
        }
      }
    }
    
    if (state.stage === 'aggregating') {
        const aggregator = state.jobQueue.find(j => j.type === 'aggregator');
        if (aggregator && aggregator.status === 'completed') {
            const chunks = parseSegmentationReport(aggregator.result!);
            dispatch({ type: 'AGGREGATOR_SUCCESS', report: aggregator.result!, chunks });
        }
    }
    
    if (state.stage === 'analysis' && state.chunks.length > 0) {
        const allDone = state.chunks.every(c => c.statusByStage.analysis === 'completed' || c.statusByStage.analysis === 'failed');
        if (allDone && !state.finalMarkdown) {
            const tables = state.chunks.filter(c => c.statusByStage.analysis === 'completed').map(c => c.resultByStage.analysis || '').filter(Boolean);
            const merged = mergeModeBTables(tables);
            dispatch({ type: 'FINALIZE_PIPELINE', markdown: merged });
        }
    }

  }, [state.jobQueue, state.stage, state.chunks, state.finalMarkdown]);

  // Cooldown Timer Effect
  useEffect(() => {
    if (state.isCoolingDown) {
      cooldownTimerRef.current = window.setInterval(() => {
        dispatch({ type: 'COOLDOWN_TICK' });
      }, 1000);
    }
    if (state.cooldownRemaining <= 0 && cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
      dispatch({ type: 'END_COOLDOWN' });
    }
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, [state.isCoolingDown, state.cooldownRemaining]);

  // Stage 1 Approval Countdown Effect
  useEffect(() => {
    if (state.stage === 'pending_approval' && state.approvalCountdown !== null) {
        if (state.approvalCountdown <= 0) {
            runStage2And3();
            return;
        }

        const timer = setInterval(() => {
            dispatch({ type: 'APPROVAL_COUNTDOWN_TICK' });
        }, 1000);

        return () => clearInterval(timer);
    }
  }, [state.stage, state.approvalCountdown, runStage2And3]);


  // Sub-stage progression simulation effect
  useEffect(() => {
    const advance = () => {
      const currentState = stateRef.current;
      if (currentState.stage !== 'analysis' || currentState.activeJobs === 0) return;

      const processingChunks = currentState.chunks.filter(
        c => c.statusByStage.analysis === 'processing'
      );

      if (processingChunks.length > 0) {
        const chunkToAdvance = processingChunks[Math.floor(Math.random() * processingChunks.length)];
        dispatch({ type: 'ADVANCE_CHUNK_SUBSTAGE', chunkId: chunkToAdvance.chunkId });
      }
    };

    const intervalId = setInterval(advance, 2000); // Advance a random chunk every 2s
    return () => clearInterval(intervalId);
  }, []); // This effect runs only once


  return { state, startSegmentation, runStage2And3, retryAll, resumeAfterRateLimit, setModel, setThinkingMode };
};