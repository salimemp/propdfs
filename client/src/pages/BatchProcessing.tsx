import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Upload, 
  Play, 
  Pause, 
  X, 
  RefreshCw, 
  Download, 
  Trash2, 
  FileText, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Loader2,
  FolderUp,
  Settings2,
  History
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface BatchFile {
  file: File;
  filename: string;
  fileSize: number;
  mimeType: string;
  status: "pending" | "uploading" | "uploaded" | "error";
  fileKey?: string;
  error?: string;
}

const conversionTypes = [
  { value: "pdf_to_word", label: "PDF to Word", accepts: ".pdf" },
  { value: "pdf_to_excel", label: "PDF to Excel", accepts: ".pdf" },
  { value: "pdf_to_ppt", label: "PDF to PowerPoint", accepts: ".pdf" },
  { value: "pdf_to_image", label: "PDF to Images", accepts: ".pdf" },
  { value: "word_to_pdf", label: "Word to PDF", accepts: ".doc,.docx" },
  { value: "excel_to_pdf", label: "Excel to PDF", accepts: ".xls,.xlsx" },
  { value: "ppt_to_pdf", label: "PowerPoint to PDF", accepts: ".ppt,.pptx" },
  { value: "image_to_pdf", label: "Images to PDF", accepts: ".jpg,.jpeg,.png,.gif,.webp,.bmp" },
  { value: "compress", label: "Compress PDF", accepts: ".pdf" },
  { value: "merge", label: "Merge PDFs", accepts: ".pdf" },
];

export default function BatchProcessing() {
  const [files, setFiles] = useState<BatchFile[]>([]);
  const [conversionType, setConversionType] = useState("pdf_to_word");
  const [maxConcurrency, setMaxConcurrency] = useState(5);
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  const uploadMutation = trpc.files.upload.useMutation();
  const createBatchMutation = trpc.batch.create.useMutation();
  const cancelBatchMutation = trpc.batch.cancel.useMutation();
  const retryFailedMutation = trpc.batch.retryFailed.useMutation();
  const deleteBatchMutation = trpc.batch.delete.useMutation();
  
  const { data: batchProgress, refetch: refetchProgress } = trpc.batch.getProgress.useQuery(
    { batchId: activeBatchId! },
    { enabled: !!activeBatchId, refetchInterval: activeBatchId ? 2000 : false }
  );
  
  const { data: batchHistory, refetch: refetchHistory } = trpc.batch.list.useQuery({
    limit: 10,
  });

  // Poll for progress updates
  useEffect(() => {
    if (batchProgress?.status === "completed" || batchProgress?.status === "failed" || batchProgress?.status === "cancelled") {
      setIsProcessing(false);
      refetchHistory();
      if (batchProgress.status === "completed") {
        toast.success(`Batch completed! ${batchProgress.completedFiles}/${batchProgress.totalFiles} files converted.`);
      } else if (batchProgress.status === "failed") {
        toast.error("Batch processing failed.");
      }
    }
  }, [batchProgress?.status]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const newFiles: BatchFile[] = selectedFiles.map(file => ({
      file,
      filename: file.name,
      fileSize: file.size,
      mimeType: file.type,
      status: "pending",
    }));
    setFiles(prev => [...prev, ...newFiles].slice(0, 500)); // Max 500 files
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    const newFiles: BatchFile[] = droppedFiles.map(file => ({
      file,
      filename: file.name,
      fileSize: file.size,
      mimeType: file.type,
      status: "pending",
    }));
    setFiles(prev => [...prev, ...newFiles].slice(0, 500));
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setFiles([]);
  };

  const uploadFiles = async () => {
    const uploadedFiles: { filename: string; fileKey: string; fileSize: number; mimeType: string }[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const batchFile = files[i];
      setFiles(prev => prev.map((f, idx) => 
        idx === i ? { ...f, status: "uploading" } : f
      ));

      try {
        const buffer = await batchFile.file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );

        const result = await uploadMutation.mutateAsync({
          filename: batchFile.filename,
          mimeType: batchFile.mimeType,
          fileSize: batchFile.fileSize,
          base64Data: base64,
        });

        uploadedFiles.push({
          filename: batchFile.filename,
          fileKey: result.fileKey,
          fileSize: batchFile.fileSize,
          mimeType: batchFile.mimeType,
        });

        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: "uploaded", fileKey: result.fileKey } : f
        ));
      } catch (error) {
        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: "error", error: "Upload failed" } : f
        ));
      }
    }

    return uploadedFiles;
  };

  const startBatch = async () => {
    if (files.length === 0) {
      toast.error("Please add files to process");
      return;
    }

    setIsProcessing(true);

    try {
      // Upload all files first
      const uploadedFiles = await uploadFiles();

      if (uploadedFiles.length === 0) {
        toast.error("No files were uploaded successfully");
        setIsProcessing(false);
        return;
      }

      // Create batch job
      const result = await createBatchMutation.mutateAsync({
        files: uploadedFiles.map(f => ({
          sourceFilename: f.filename,
          sourceFormat: f.mimeType.split('/')[1] || 'unknown',
          sourceSize: f.fileSize,
          outputFormat: conversionType.split('_to_')[1] || 'pdf',
          conversionType,
        })),
      });

      setActiveBatchId(result.batchId);
      toast.success(`Batch job created with ${uploadedFiles.length} files`);
    } catch (error) {
      toast.error("Failed to create batch job");
      setIsProcessing(false);
    }
  };

  const cancelBatch = async () => {
    if (!activeBatchId) return;
    
    try {
      await cancelBatchMutation.mutateAsync({ batchId: activeBatchId });
      toast.success("Batch cancelled");
      setIsProcessing(false);
    } catch (error) {
      toast.error("Failed to cancel batch");
    }
  };

  const retryFailed = async (batchId: string) => {
    try {
      const count = await retryFailedMutation.mutateAsync({ batchId });
      toast.success(`Retrying ${count} failed items`);
      setActiveBatchId(batchId);
      setIsProcessing(true);
    } catch (error) {
      toast.error("Failed to retry items");
    }
  };

  const deleteBatch = async (batchId: string) => {
    try {
      await deleteBatchMutation.mutateAsync({ batchId });
      toast.success("Batch deleted");
      refetchHistory();
      if (activeBatchId === batchId) {
        setActiveBatchId(null);
      }
    } catch (error) {
      toast.error("Failed to delete batch");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "queued":
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Queued</Badge>;
      case "processing":
        return <Badge variant="default" className="bg-blue-500"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>;
      case "completed":
        return <Badge variant="default" className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case "cancelled":
        return <Badge variant="outline"><X className="w-3 h-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const selectedConversion = conversionTypes.find(c => c.value === conversionType);

  return (
    <DashboardLayout>
      <div className="container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Batch Processing</h1>
          <p className="text-muted-foreground">
            Process up to 500 files simultaneously with parallel processing
          </p>
        </div>

        <Tabs defaultValue="new" className="space-y-6">
          <TabsList>
            <TabsTrigger value="new">
              <FolderUp className="w-4 h-4 mr-2" />
              New Batch
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="w-4 h-4 mr-2" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* File Upload Area */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Upload Files</CardTitle>
                  <CardDescription>
                    Drag and drop files or click to browse. Max 500 files per batch.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Drop Zone */}
                  <div
                    className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => document.getElementById("batch-file-input")?.click()}
                  >
                    <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg font-medium mb-1">Drop files here</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Accepted: {selectedConversion?.accepts || "All files"}
                    </p>
                    <input
                      id="batch-file-input"
                      type="file"
                      multiple
                      accept={selectedConversion?.accepts}
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>

                  {/* File List */}
                  {files.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {files.length} file{files.length !== 1 ? "s" : ""} selected
                        </span>
                        <Button variant="ghost" size="sm" onClick={clearFiles}>
                          Clear All
                        </Button>
                      </div>
                      <ScrollArea className="h-64 border rounded-lg">
                        <div className="p-2 space-y-1">
                          {files.map((file, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-2 rounded hover:bg-muted/50"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                                <span className="truncate text-sm">{file.filename}</span>
                                <span className="text-xs text-muted-foreground">
                                  {formatFileSize(file.fileSize)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {file.status === "uploading" && (
                                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                                )}
                                {file.status === "uploaded" && (
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                )}
                                {file.status === "error" && (
                                  <XCircle className="w-4 h-4 text-red-500" />
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => removeFile(index)}
                                  disabled={isProcessing}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings2 className="w-5 h-5" />
                    Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Conversion Type</Label>
                    <Select value={conversionType} onValueChange={setConversionType} disabled={isProcessing}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {conversionTypes.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Parallel Processing: {maxConcurrency}</Label>
                    <Slider
                      value={[maxConcurrency]}
                      onValueChange={([v]) => setMaxConcurrency(v)}
                      min={1}
                      max={10}
                      step={1}
                      disabled={isProcessing}
                    />
                    <p className="text-xs text-muted-foreground">
                      Higher values process faster but use more resources
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Email Notification</Label>
                      <p className="text-xs text-muted-foreground">
                        Notify when batch completes
                      </p>
                    </div>
                    <Switch
                      checked={notifyOnComplete}
                      onCheckedChange={setNotifyOnComplete}
                      disabled={isProcessing}
                    />
                  </div>

                  <div className="pt-4 space-y-2">
                    {!isProcessing ? (
                      <Button
                        className="w-full"
                        size="lg"
                        onClick={startBatch}
                        disabled={files.length === 0}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Start Processing
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        size="lg"
                        variant="destructive"
                        onClick={cancelBatch}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Cancel Batch
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Active Batch Progress */}
            {batchProgress && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Batch Progress</CardTitle>
                      <CardDescription>
                        {batchProgress.batchId}
                      </CardDescription>
                    </div>
                    {getStatusBadge(batchProgress.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Overall Progress</span>
                      <span>{batchProgress.progressPercent}%</span>
                    </div>
                    <Progress value={batchProgress.progressPercent} />
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-2xl font-bold">{batchProgress.totalFiles}</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                    <div className="p-3 bg-green-500/10 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">{batchProgress.completedFiles}</p>
                      <p className="text-xs text-muted-foreground">Completed</p>
                    </div>
                    <div className="p-3 bg-red-500/10 rounded-lg">
                      <p className="text-2xl font-bold text-red-600">{batchProgress.failedFiles}</p>
                      <p className="text-xs text-muted-foreground">Failed</p>
                    </div>
                  </div>

                  {batchProgress.estimatedTimeRemaining && batchProgress.status === "processing" && (
                    <p className="text-sm text-muted-foreground text-center">
                      Estimated time remaining: {formatDuration(batchProgress.estimatedTimeRemaining)}
                    </p>
                  )}

                  {/* Item List */}
                  <ScrollArea className="h-48 border rounded-lg">
                    <div className="p-2 space-y-1">
                      {batchProgress.items.map(item => (
                        <div
                          key={item.itemId}
                          className="flex items-center justify-between p-2 rounded hover:bg-muted/50"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                            <span className="truncate text-sm">{item.filename}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.status === "processing" && (
                              <div className="flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span className="text-xs">{item.progress}%</span>
                              </div>
                            )}
                            {item.status === "completed" && item.outputUrl && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => window.open(item.outputUrl, "_blank")}
                              >
                                <Download className="w-3 h-3" />
                              </Button>
                            )}
                            {getStatusBadge(item.status)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Batch History</CardTitle>
                <CardDescription>
                  View and manage your previous batch jobs
                </CardDescription>
              </CardHeader>
              <CardContent>
                {batchHistory && batchHistory.length > 0 ? (
                  <div className="space-y-3">
                    {batchHistory.map(batch => (
                      <div
                        key={batch.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{batch.batchId}</span>
                            {getStatusBadge(batch.status)}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {batch.completedFiles}/{batch.totalFiles} files • 
                            {batch.failedFiles > 0 && ` ${batch.failedFiles} failed •`}
                            {" "}{new Date(batch.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {batch.status === "completed" && batch.failedFiles > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => retryFailed(batch.batchId)}
                            >
                              <RefreshCw className="w-4 h-4 mr-1" />
                              Retry Failed
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setActiveBatchId(batch.batchId);
                              refetchProgress();
                            }}
                          >
                            View Details
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteBatch(batch.batchId)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No batch jobs yet</p>
                    <p className="text-sm">Start a new batch to see it here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
