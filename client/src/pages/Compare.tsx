import { useState, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { 
  Upload, FileText, GitCompare, ArrowRight, 
  CheckCircle2, XCircle, AlertCircle, Loader2,
  Download, RefreshCw
} from "lucide-react";

interface UploadedFile {
  file: File;
  url: string;
  name: string;
}

export default function Compare() {
  const [file1, setFile1] = useState<UploadedFile | null>(null);
  const [file2, setFile2] = useState<UploadedFile | null>(null);
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState<{
    totalPages1: number;
    totalPages2: number;
    changedPages: number;
    addedPages: number;
    removedPages: number;
    metadataChanges: { field: string; value1?: string; value2?: string }[];
    summary: string;
  } | null>(null);

  const uploadMutation = trpc.files.upload.useMutation();
  const compareMutation = trpc.pdfComparison.compare.useMutation();

  const handleFileSelect = useCallback(async (
    e: React.ChangeEvent<HTMLInputElement>,
    setFile: (file: UploadedFile | null) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Please select a PDF file");
      return;
    }

    try {
      // Convert to base64 for upload
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        
        const result = await uploadMutation.mutateAsync({
          filename: file.name,
          mimeType: file.type,
          fileSize: file.size,
          base64Data: base64,
        });

        setFile({
          file,
          url: result.url,
          name: file.name,
        });

        toast.success(`${file.name} uploaded successfully`);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error("Failed to upload file");
    }
  }, [uploadMutation]);

  const handleCompare = async () => {
    if (!file1 || !file2) {
      toast.error("Please upload both PDF files");
      return;
    }

    setComparing(true);
    setResult(null);

    try {
      const comparison = await compareMutation.mutateAsync({
        file1Url: file1.url,
        file2Url: file2.url,
      });

      setResult(comparison);
      toast.success("Comparison complete!");
    } catch (error) {
      toast.error("Failed to compare PDFs");
    } finally {
      setComparing(false);
    }
  };

  const handleReset = () => {
    setFile1(null);
    setFile2(null);
    setResult(null);
  };

  return (
    <DashboardLayout>
      <div className="container py-8 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">PDF Comparison</h1>
          <p className="text-slate-600">
            Compare two PDF documents to identify differences in pages, metadata, and structure.
          </p>
        </div>

        {/* File Upload Section */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* File 1 */}
          <Card className={file1 ? "border-green-200 bg-green-50/50" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Original Document
              </CardTitle>
              <CardDescription>Upload the first PDF to compare</CardDescription>
            </CardHeader>
            <CardContent>
              {file1 ? (
                <div className="flex items-center gap-3 p-4 bg-white rounded-lg border">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{file1.name}</p>
                    <p className="text-sm text-slate-500">Ready for comparison</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFile1(null)}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
                  <Upload className="h-10 w-10 text-slate-400 mb-3" />
                  <span className="text-sm font-medium text-slate-700">
                    Click to upload PDF
                  </span>
                  <span className="text-xs text-slate-500 mt-1">
                    or drag and drop
                  </span>
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e, setFile1)}
                  />
                </label>
              )}
            </CardContent>
          </Card>

          {/* File 2 */}
          <Card className={file2 ? "border-green-200 bg-green-50/50" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Modified Document
              </CardTitle>
              <CardDescription>Upload the second PDF to compare</CardDescription>
            </CardHeader>
            <CardContent>
              {file2 ? (
                <div className="flex items-center gap-3 p-4 bg-white rounded-lg border">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{file2.name}</p>
                    <p className="text-sm text-slate-500">Ready for comparison</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFile2(null)}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
                  <Upload className="h-10 w-10 text-slate-400 mb-3" />
                  <span className="text-sm font-medium text-slate-700">
                    Click to upload PDF
                  </span>
                  <span className="text-xs text-slate-500 mt-1">
                    or drag and drop
                  </span>
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e, setFile2)}
                  />
                </label>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Compare Button */}
        <div className="flex justify-center gap-4 mb-8">
          <Button
            size="lg"
            onClick={handleCompare}
            disabled={!file1 || !file2 || comparing}
            className="min-w-[200px]"
          >
            {comparing ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Comparing...
              </>
            ) : (
              <>
                <GitCompare className="h-5 w-5 mr-2" />
                Compare PDFs
              </>
            )}
          </Button>
          {(file1 || file2 || result) && (
            <Button variant="outline" size="lg" onClick={handleReset}>
              <RefreshCw className="h-5 w-5 mr-2" />
              Reset
            </Button>
          )}
        </div>

        {/* Results Section */}
        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Comparison Results
              </CardTitle>
              <CardDescription>{result.summary}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Page Statistics */}
              <div>
                <h3 className="font-semibold mb-4">Page Statistics</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-slate-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-slate-900">{result.totalPages1}</p>
                    <p className="text-sm text-slate-600">Original Pages</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-slate-900">{result.totalPages2}</p>
                    <p className="text-sm text-slate-600">Modified Pages</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-green-600">+{result.addedPages}</p>
                    <p className="text-sm text-slate-600">Pages Added</p>
                  </div>
                  <div className="p-4 bg-red-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-red-600">-{result.removedPages}</p>
                    <p className="text-sm text-slate-600">Pages Removed</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Changes Overview */}
              <div>
                <h3 className="font-semibold mb-4">Changes Overview</h3>
                <div className="flex flex-wrap gap-3">
                  {result.changedPages > 0 && (
                    <Badge variant="secondary" className="text-sm py-1.5 px-3">
                      <AlertCircle className="h-4 w-4 mr-1.5" />
                      {result.changedPages} page(s) with dimension changes
                    </Badge>
                  )}
                  {result.addedPages > 0 && (
                    <Badge className="bg-green-100 text-green-800 text-sm py-1.5 px-3">
                      {result.addedPages} page(s) added
                    </Badge>
                  )}
                  {result.removedPages > 0 && (
                    <Badge className="bg-red-100 text-red-800 text-sm py-1.5 px-3">
                      {result.removedPages} page(s) removed
                    </Badge>
                  )}
                  {result.metadataChanges.length > 0 && (
                    <Badge variant="outline" className="text-sm py-1.5 px-3">
                      {result.metadataChanges.length} metadata change(s)
                    </Badge>
                  )}
                </div>
              </div>

              {/* Metadata Changes */}
              {result.metadataChanges.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-4">Metadata Changes</h3>
                    <div className="space-y-3">
                      {result.metadataChanges.map((change, index) => (
                        <div key={index} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                          <div className="font-medium capitalize min-w-[100px]">
                            {change.field}
                          </div>
                          <div className="flex-1 flex items-center gap-2 text-sm">
                            <span className="text-red-600 line-through">
                              {change.value1 || "(empty)"}
                            </span>
                            <ArrowRight className="h-4 w-4 text-slate-400" />
                            <span className="text-green-600">
                              {change.value2 || "(empty)"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* No Changes */}
              {result.changedPages === 0 && 
               result.addedPages === 0 && 
               result.removedPages === 0 && 
               result.metadataChanges.length === 0 && (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
                  <p className="text-lg font-medium text-slate-900">Documents are identical</p>
                  <p className="text-slate-600">No differences were detected between the two PDFs.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tips */}
        <Card className="mt-8 bg-blue-50/50 border-blue-200">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-blue-900 mb-2">Comparison Tips</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Upload the original document first, then the modified version</li>
              <li>• The comparison analyzes page count, dimensions, and metadata</li>
              <li>• For text-level comparison, use the OCR feature first to extract text</li>
              <li>• Large PDFs may take longer to process</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
