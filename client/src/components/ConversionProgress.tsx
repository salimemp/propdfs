import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Loader2, CheckCircle2, XCircle, FileText, 
  Clock, Zap, X, Download
} from "lucide-react";

export interface ConversionJob {
  id: string;
  filename: string;
  type: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  outputUrl?: string;
}

interface ConversionProgressProps {
  jobs: ConversionJob[];
  onDismiss?: (id: string) => void;
  onDownload?: (job: ConversionJob) => void;
  onRetry?: (job: ConversionJob) => void;
}

export default function ConversionProgress({ 
  jobs, 
  onDismiss, 
  onDownload,
  onRetry 
}: ConversionProgressProps) {
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, number>>({});

  // Update elapsed times for processing jobs
  useEffect(() => {
    const interval = setInterval(() => {
      const newTimes: Record<string, number> = {};
      jobs.forEach(job => {
        if (job.status === "processing" && job.startedAt) {
          newTimes[job.id] = Math.floor((Date.now() - new Date(job.startedAt).getTime()) / 1000);
        }
      });
      setElapsedTimes(newTimes);
    }, 1000);

    return () => clearInterval(interval);
  }, [jobs]);

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getStatusIcon = (status: ConversionJob["status"]) => {
    switch (status) {
      case "queued":
        return <Clock className="h-4 w-4 text-slate-400" />;
      case "processing":
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-600" />;
    }
  };

  const getStatusBadge = (status: ConversionJob["status"]) => {
    switch (status) {
      case "queued":
        return <Badge variant="secondary">Queued</Badge>;
      case "processing":
        return <Badge className="bg-blue-100 text-blue-800">Processing</Badge>;
      case "completed":
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
    }
  };

  if (jobs.length === 0) return null;

  const activeJobs = jobs.filter(j => j.status === "queued" || j.status === "processing");
  const completedJobs = jobs.filter(j => j.status === "completed" || j.status === "failed");

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <span className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-600" />
            Conversion Progress
          </span>
          {activeJobs.length > 0 && (
            <Badge variant="outline" className="ml-2">
              {activeJobs.length} active
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Active Jobs */}
        {activeJobs.map((job) => (
          <div 
            key={job.id} 
            className="p-4 bg-slate-50 rounded-lg border border-slate-200"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                {getStatusIcon(job.status)}
                <div>
                  <p className="font-medium text-slate-900 truncate max-w-[200px]">
                    {job.filename}
                  </p>
                  <p className="text-xs text-slate-500">{job.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(job.status)}
                {onDismiss && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onDismiss(job.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Progress</span>
                <span className="font-medium">{job.progress}%</span>
              </div>
              <Progress value={job.progress} className="h-2" />
              
              {job.status === "processing" && elapsedTimes[job.id] !== undefined && (
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Elapsed: {formatTime(elapsedTimes[job.id])}
                </p>
              )}
            </div>
          </div>
        ))}

        {/* Completed Jobs */}
        {completedJobs.length > 0 && (
          <div className="space-y-2">
            {activeJobs.length > 0 && (
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Recent
              </p>
            )}
            {completedJobs.slice(0, 3).map((job) => (
              <div 
                key={job.id} 
                className={`p-3 rounded-lg border ${
                  job.status === "completed" 
                    ? "bg-green-50 border-green-200" 
                    : "bg-red-50 border-red-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(job.status)}
                    <div>
                      <p className="font-medium text-slate-900 truncate max-w-[180px]">
                        {job.filename}
                      </p>
                      {job.error && (
                        <p className="text-xs text-red-600">{job.error}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {job.status === "completed" && job.outputUrl && onDownload && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDownload(job)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    {job.status === "failed" && onRetry && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRetry(job)}
                      >
                        Retry
                      </Button>
                    )}
                    {onDismiss && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => onDismiss(job.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {jobs.length > 0 && (
          <div className="pt-3 border-t flex items-center justify-between text-sm">
            <span className="text-slate-500">
              {completedJobs.filter(j => j.status === "completed").length} completed, 
              {" "}{completedJobs.filter(j => j.status === "failed").length} failed
            </span>
            {completedJobs.length > 3 && (
              <Button variant="link" size="sm" className="text-blue-600">
                View all ({completedJobs.length})
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Hook for managing conversion jobs
export function useConversionJobs() {
  const [jobs, setJobs] = useState<ConversionJob[]>([]);

  const addJob = (job: Omit<ConversionJob, "id" | "progress" | "status">) => {
    const newJob: ConversionJob = {
      ...job,
      id: Math.random().toString(36).substr(2, 9),
      status: "queued",
      progress: 0,
    };
    setJobs(prev => [...prev, newJob]);
    return newJob.id;
  };

  const updateJob = (id: string, updates: Partial<ConversionJob>) => {
    setJobs(prev => prev.map(job => 
      job.id === id ? { ...job, ...updates } : job
    ));
  };

  const removeJob = (id: string) => {
    setJobs(prev => prev.filter(job => job.id !== id));
  };

  const startJob = (id: string) => {
    updateJob(id, { 
      status: "processing", 
      startedAt: new Date(),
      progress: 0 
    });
  };

  const completeJob = (id: string, outputUrl?: string) => {
    updateJob(id, { 
      status: "completed", 
      completedAt: new Date(),
      progress: 100,
      outputUrl 
    });
  };

  const failJob = (id: string, error: string) => {
    updateJob(id, { 
      status: "failed", 
      completedAt: new Date(),
      error 
    });
  };

  const simulateProgress = (id: string, duration: number = 5000) => {
    startJob(id);
    
    const steps = 20;
    const interval = duration / steps;
    let currentStep = 0;

    const progressInterval = setInterval(() => {
      currentStep++;
      const progress = Math.min(Math.round((currentStep / steps) * 100), 99);
      updateJob(id, { progress });

      if (currentStep >= steps) {
        clearInterval(progressInterval);
      }
    }, interval);

    return progressInterval;
  };

  return {
    jobs,
    addJob,
    updateJob,
    removeJob,
    startJob,
    completeJob,
    failJob,
    simulateProgress,
  };
}
