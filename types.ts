
export type Stage = 'idle' | 'segmentation' | 'aggregating' | 'pending_approval' | 'analysis' | 'completed';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type ModelName = 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-3-pro-preview';

export const AVAILABLE_MODELS: ModelName[] = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-pro-preview'];

export type AnalysisSubStage = 'queued' | 'analyzing' | 'scoring' | 'refining' | 'compiling';

export type LogType = 'info' | 'success' | 'warning' | 'error';

export interface ModelConfig {
  segmentation: ModelName;
  analysis: ModelName;
  image: ModelName;
}

export interface SlidePreview {
    slideNumber: number;
    textContent: string;
    imageAnalysisContent: string | null;
    status: 'processing' | 'completed';
}

export interface LogEntry {
    id: string;
    timestamp: string;
    type: LogType;
    message: string;
}

export interface LectureChunk {
  chunkId: string;
  slideRange: string;
  tsList: string[];
  tsStart: string;
  tsEnd: string;
  flags: string[];
  notes: string;
  qualityClassification?: 'Chất lượng cao' | 'Trung bình' | 'Chất lượng thấp';
  
  // Status, results, and errors are now tracked per-stage
  statusByStage: {
    analysis: JobStatus;
    subStage: AnalysisSubStage;
  };
  
  resultByStage: {
    analysis?: string; // Mode B table for this chunk
    refinement?: string; // Final merged content for this chunk
  },

  errorByStage: {
    analysis?: string;
    refinement?: string;
  },

  attempts: number; // General attempt count for the chunk
}

export interface WorkerJob {
  jobId: string;
  type: 'slice_worker' | 'aggregator' | 'chunk_analysis'; // Refinement is part of analysis
  stage: Stage;
  payload: string;
  
  sliceId?: string;
  chunkId?: string;
  
  status: JobStatus;
  attempt: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  result?: string; // The raw markdown text result from Gemini
}

export interface RateLimitRecoveryState {
  isPaused: boolean;
  affectedStage: 'segmentation' | 'analysis' | null;
  failingModel: ModelName | null;
  switchAttempted: boolean;
}

export interface DashboardState {
  stage: Stage;
  
  maxConcurrency: number;
  activeJobs: number;
  isCoolingDown: boolean;
  cooldownRemaining: number;
  
  models: ModelConfig; 
  isThinkingMode: boolean;

  jobQueue: WorkerJob[];
  chunks: LectureChunk[];
  logs: LogEntry[];
  
  segmentationReport?: string; // Store the raw Mode A report
  finalMarkdown: string;
  approvalCountdown: number | null;
  
  rateLimit?: RateLimitRecoveryState;
}
