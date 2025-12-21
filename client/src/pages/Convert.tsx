import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { 
  Upload, FileText, Image, FileSpreadsheet, Presentation,
  Loader2, CheckCircle, XCircle, Download, Trash2,
  Merge, Scissors, RotateCw, Droplets, Lock, FileArchive,
  Mic, Sparkles
} from "lucide-react";
import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";

type ConversionType = 
  | "pdf_to_word" | "pdf_to_excel" | "pdf_to_ppt"
  | "word_to_pdf" | "excel_to_pdf" | "ppt_to_pdf"
  | "image_to_pdf" | "pdf_to_image"
  | "html_to_pdf" | "markdown_to_pdf"
  | "merge" | "split" | "compress" | "rotate" | "watermark" | "encrypt";

interface UploadedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  status: "pending" | "uploading" | "converting" | "completed" | "error";
  progress: number;
  result?: { url: string; filename: string };
  error?: string;
}

const conversionOptions = [
  { value: "pdf_to_word", label: "PDF to Word", icon: FileText, from: "PDF", to: "DOCX" },
  { value: "pdf_to_excel", label: "PDF to Excel", icon: FileSpreadsheet, from: "PDF", to: "XLSX" },
  { value: "pdf_to_ppt", label: "PDF to PowerPoint", icon: Presentation, from: "PDF", to: "PPTX" },
  { value: "word_to_pdf", label: "Word to PDF", icon: FileText, from: "DOCX", to: "PDF" },
  { value: "excel_to_pdf", label: "Excel to PDF", icon: FileSpreadsheet, from: "XLSX", to: "PDF" },
  { value: "ppt_to_pdf", label: "PowerPoint to PDF", icon: Presentation, from: "PPTX", to: "PDF" },
  { value: "image_to_pdf", label: "Image to PDF", icon: Image, from: "IMG", to: "PDF" },
  { value: "pdf_to_image", label: "PDF to Image", icon: Image, from: "PDF", to: "PNG" },
  { value: "html_to_pdf", label: "HTML to PDF", icon: FileText, from: "HTML", to: "PDF" },
  { value: "markdown_to_pdf", label: "Markdown to PDF", icon: FileText, from: "MD", to: "PDF" },
];

const pdfOperations = [
  { value: "merge", label: "Merge PDFs", icon: Merge, description: "Combine multiple PDFs into one" },
  { value: "split", label: "Split PDF", icon: Scissors, description: "Split a PDF into separate pages" },
  { value: "compress", label: "Compress PDF", icon: FileArchive, description: "Reduce file size up to 90%" },
  { value: "rotate", label: "Rotate Pages", icon: RotateCw, description: "Rotate PDF pages" },
  { value: "watermark", label: "Add Watermark", icon: Droplets, description: "Add text or image watermark" },
  { value: "encrypt", label: "Encrypt PDF", icon: Lock, description: "Password protect your PDF" },
];

export default function Convert() {
  const { user, isAuthenticated } = useAuth();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [conversionType, setConversionType] = useState<ConversionType>("pdf_to_word");
  const [activeTab, setActiveTab] = useState("convert");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.files.upload.useMutation();
  const createConversionMutation = trpc.conversions.create.useMutation();

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const newFiles: UploadedFile[] = selectedFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      status: "pending",
      progress: 0,
    }));
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    const newFiles: UploadedFile[] = droppedFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      status: "pending",
      progress: 0,
    }));
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const processFiles = async () => {
    if (!isAuthenticated) {
      toast.error("Please sign in to convert files");
      window.location.href = getLoginUrl();
      return;
    }

    for (const uploadedFile of files) {
      if (uploadedFile.status !== "pending") continue;

      try {
        // Update status to uploading
        setFiles(prev => prev.map(f => 
          f.id === uploadedFile.id ? { ...f, status: "uploading", progress: 20 } : f
        ));

        // Read file as base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(uploadedFile.file);
        });

        // Upload file
        const uploadResult = await uploadMutation.mutateAsync({
          filename: uploadedFile.name,
          mimeType: uploadedFile.type,
          fileSize: uploadedFile.size,
          base64Data: base64,
        });

        setFiles(prev => prev.map(f => 
          f.id === uploadedFile.id ? { ...f, status: "converting", progress: 50 } : f
        ));

        // Get file extension
        const ext = uploadedFile.name.split('.').pop()?.toLowerCase() || '';
        
        // Create conversion
        const conversionResult = await createConversionMutation.mutateAsync({
          sourceFileId: uploadResult.id!,
          sourceFilename: uploadedFile.name,
          sourceFormat: ext,
          sourceSize: uploadedFile.size,
          outputFormat: conversionOptions.find(o => o.value === conversionType)?.to.toLowerCase() || 'pdf',
          conversionType: conversionType as any,
        });

        setFiles(prev => prev.map(f => 
          f.id === uploadedFile.id ? { 
            ...f, 
            status: "completed", 
            progress: 100,
            result: { url: uploadResult.url, filename: uploadedFile.name }
          } : f
        ));

        toast.success(`${uploadedFile.name} converted successfully!`);
      } catch (error: any) {
        setFiles(prev => prev.map(f => 
          f.id === uploadedFile.id ? { 
            ...f, 
            status: "error", 
            error: error.message || "Conversion failed"
          } : f
        ));
        toast.error(`Failed to convert ${uploadedFile.name}`);
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const content = (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Convert Files</h1>
        <p className="text-slate-600 mt-1">
          Convert your documents to any format with enterprise-grade quality
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="convert">Convert</TabsTrigger>
          <TabsTrigger value="operations">PDF Operations</TabsTrigger>
          <TabsTrigger value="transcribe">Transcribe</TabsTrigger>
        </TabsList>

        <TabsContent value="convert" className="space-y-6 mt-6">
          {/* Conversion Type Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Select Conversion Type</CardTitle>
              <CardDescription>Choose the format you want to convert to</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {conversionOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setConversionType(option.value as ConversionType)}
                    className={`p-4 rounded-lg border-2 text-center transition-all ${
                      conversionType === option.value
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <option.icon className={`h-6 w-6 mx-auto mb-2 ${
                      conversionType === option.value ? 'text-blue-600' : 'text-slate-500'
                    }`} />
                    <div className="text-xs font-medium">
                      {option.from} → {option.to}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* File Upload Area */}
          <Card>
            <CardHeader>
              <CardTitle>Upload Files</CardTitle>
              <CardDescription>
                Drag and drop files or click to browse. Max 25MB per file (free), 500MB (Pro)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 transition-colors"
              >
                <Upload className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-slate-700">
                  Drop files here or click to upload
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  Supports PDF, Word, Excel, PowerPoint, Images, and more
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.svg,.webp,.html,.htm,.md,.txt,.rtf"
                />
              </div>

              {/* File List */}
              {files.length > 0 && (
                <div className="mt-6 space-y-3">
                  {files.map((file) => (
                    <div key={file.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                        file.status === 'completed' ? 'bg-green-100' :
                        file.status === 'error' ? 'bg-red-100' :
                        file.status === 'uploading' || file.status === 'converting' ? 'bg-blue-100' :
                        'bg-slate-200'
                      }`}>
                        {file.status === 'completed' ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : file.status === 'error' ? (
                          <XCircle className="h-5 w-5 text-red-600" />
                        ) : file.status === 'uploading' || file.status === 'converting' ? (
                          <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                        ) : (
                          <FileText className="h-5 w-5 text-slate-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 truncate">{file.name}</p>
                        <p className="text-sm text-slate-500">{formatFileSize(file.size)}</p>
                        {(file.status === 'uploading' || file.status === 'converting') && (
                          <Progress value={file.progress} className="mt-2 h-1" />
                        )}
                        {file.error && (
                          <p className="text-sm text-red-600 mt-1">{file.error}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {file.status === 'completed' && file.result && (
                          <a href={file.result.url} download={file.result.filename}>
                            <Button size="sm" variant="outline" className="gap-1">
                              <Download className="h-4 w-4" />
                              Download
                            </Button>
                          </a>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFile(file.id)}
                          className="text-slate-500 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Convert Button */}
              {files.length > 0 && (
                <div className="mt-6 flex justify-end">
                  <Button 
                    onClick={processFiles}
                    disabled={files.every(f => f.status !== 'pending')}
                    className="gap-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    Convert {files.filter(f => f.status === 'pending').length} File(s)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operations" className="space-y-6 mt-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pdfOperations.map((op) => (
              <Card key={op.value} className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                      <op.icon className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{op.label}</h3>
                      <p className="text-sm text-slate-600 mt-1">{op.description}</p>
                    </div>
                  </div>
                  <Button 
                    className="w-full mt-4" 
                    variant="outline"
                    onClick={() => {
                      setConversionType(op.value as ConversionType);
                      setActiveTab("convert");
                      toast.info(`Selected ${op.label}. Upload your PDF files to continue.`);
                    }}
                  >
                    Select
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="transcribe" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mic className="h-5 w-5 text-blue-600" />
                Audio Transcription
              </CardTitle>
              <CardDescription>
                Convert audio recordings to text documents with AI-powered transcription in 50+ languages
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'audio/*,.mp3,.wav,.m4a,.ogg,.webm';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) {
                      toast.info("Audio transcription feature coming soon!");
                    }
                  };
                  input.click();
                }}
                className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 transition-colors"
              >
                <Mic className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-slate-700">
                  Upload audio file to transcribe
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  Supports MP3, WAV, M4A, OGG, WebM (max 16MB)
                </p>
              </div>
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Supported Languages</h4>
                <p className="text-sm text-blue-700">
                  English, Spanish, French, German, Chinese, Japanese, Korean, Arabic, Hindi, Portuguese, 
                  Russian, Italian, Dutch, Polish, Turkish, Swedish, Danish, Norwegian, Finnish, and 40+ more
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Usage Info for non-authenticated users */}
      {!isAuthenticated && (
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">Sign in for more features</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Get 10 free conversions per month, cloud storage, and conversion history
                </p>
              </div>
              <a href={getLoginUrl()}>
                <Button>Sign In</Button>
              </a>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  // If authenticated, wrap in DashboardLayout
  if (isAuthenticated) {
    return <DashboardLayout>{content}</DashboardLayout>;
  }

  // For non-authenticated users, show standalone page
  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="border-b bg-white sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <FileText className="h-8 w-8 text-blue-600" />
            <span className="text-xl font-bold text-slate-900">ProPDFs</span>
          </a>
          <a href={getLoginUrl()}>
            <Button>Sign In</Button>
          </a>
        </div>
      </nav>
      <main className="container py-8">
        {content}
      </main>
    </div>
  );
}
