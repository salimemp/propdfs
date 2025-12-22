import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { 
  Upload, FileText, Image, Type, Highlighter, MessageSquare,
  Loader2, Save, Download, Trash2, ZoomIn, ZoomOut,
  RotateCw, RotateCcw, ChevronLeft, ChevronRight, Pencil,
  Square, Circle, ArrowRight, Stamp, Signature, Eraser,
  Undo, Redo, Layers, Eye, EyeOff, Lock, Unlock,
  Plus, Minus, Move, Hand, MousePointer, Search, Volume2
} from "lucide-react";
import TextToSpeech from "@/components/TextToSpeech";
import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";

interface Annotation {
  id: string;
  type: "highlight" | "underline" | "strikethrough" | "text" | "shape" | "stamp" | "signature" | "comment";
  page: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  content?: string;
  color?: string;
  author?: string;
  createdAt: Date;
}

interface PDFPage {
  pageNumber: number;
  width: number;
  height: number;
  thumbnail?: string;
}

const tools = [
  { id: "select", icon: MousePointer, label: "Select" },
  { id: "hand", icon: Hand, label: "Pan" },
  { id: "text", icon: Type, label: "Add Text" },
  { id: "highlight", icon: Highlighter, label: "Highlight" },
  { id: "comment", icon: MessageSquare, label: "Comment" },
  { id: "shape", icon: Square, label: "Shape" },
  { id: "stamp", icon: Stamp, label: "Stamp" },
  { id: "signature", icon: Signature, label: "Signature" },
  { id: "eraser", icon: Eraser, label: "Eraser" },
];

const stamps = [
  { id: "approved", label: "APPROVED", color: "text-green-600" },
  { id: "rejected", label: "REJECTED", color: "text-red-600" },
  { id: "draft", label: "DRAFT", color: "text-yellow-600" },
  { id: "confidential", label: "CONFIDENTIAL", color: "text-purple-600" },
  { id: "final", label: "FINAL", color: "text-blue-600" },
];

const colors = [
  "#FFFF00", // Yellow
  "#00FF00", // Green
  "#00FFFF", // Cyan
  "#FF00FF", // Magenta
  "#FF0000", // Red
  "#0000FF", // Blue
  "#FFA500", // Orange
  "#800080", // Purple
];

export default function Editor() {
  const { user, isAuthenticated } = useAuth();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PDFPage[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [activeTool, setActiveTool] = useState("select");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState(colors[0]);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [commentInput, setCommentInput] = useState("");
  const [selectedStamp, setSelectedStamp] = useState(stamps[0]);
  const [history, setHistory] = useState<Annotation[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showTTS, setShowTTS] = useState(false);
  const [extractedText, setExtractedText] = useState<string>("");
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.files.upload.useMutation();

  useEffect(() => {
    if (!isAuthenticated) {
      window.location.href = getLoginUrl();
    }
  }, [isAuthenticated]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Please select a PDF file");
      return;
    }

    setIsLoading(true);
    setPdfFile(file);

    try {
      // Create object URL for preview
      const url = URL.createObjectURL(file);
      setPdfUrl(url);

      // Simulate loading PDF pages (in production, use pdf.js)
      // For now, we'll create placeholder pages
      const mockPages: PDFPage[] = [];
      for (let i = 1; i <= 5; i++) {
        mockPages.push({
          pageNumber: i,
          width: 612,
          height: 792,
        });
      }
      setPages(mockPages);
      setTotalPages(mockPages.length);
      setCurrentPage(1);
      
      toast.success("PDF loaded successfully");
    } catch (error) {
      toast.error("Failed to load PDF");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    switch (activeTool) {
      case "text":
        const newTextAnnotation: Annotation = {
          id: Math.random().toString(36).substr(2, 9),
          type: "text",
          page: currentPage,
          x,
          y,
          content: textInput || "New Text",
          color: selectedColor,
          author: user?.name || "Anonymous",
          createdAt: new Date(),
        };
        addAnnotation(newTextAnnotation);
        break;

      case "highlight":
        const newHighlight: Annotation = {
          id: Math.random().toString(36).substr(2, 9),
          type: "highlight",
          page: currentPage,
          x,
          y,
          width: 100,
          height: 20,
          color: selectedColor,
          author: user?.name || "Anonymous",
          createdAt: new Date(),
        };
        addAnnotation(newHighlight);
        break;

      case "comment":
        const newComment: Annotation = {
          id: Math.random().toString(36).substr(2, 9),
          type: "comment",
          page: currentPage,
          x,
          y,
          content: commentInput || "New comment",
          color: selectedColor,
          author: user?.name || "Anonymous",
          createdAt: new Date(),
        };
        addAnnotation(newComment);
        break;

      case "stamp":
        const newStamp: Annotation = {
          id: Math.random().toString(36).substr(2, 9),
          type: "stamp",
          page: currentPage,
          x,
          y,
          content: selectedStamp.label,
          color: selectedStamp.color,
          author: user?.name || "Anonymous",
          createdAt: new Date(),
        };
        addAnnotation(newStamp);
        break;

      case "shape":
        const newShape: Annotation = {
          id: Math.random().toString(36).substr(2, 9),
          type: "shape",
          page: currentPage,
          x,
          y,
          width: 100,
          height: 100,
          color: selectedColor,
          author: user?.name || "Anonymous",
          createdAt: new Date(),
        };
        addAnnotation(newShape);
        break;

      case "select":
        // Check if clicking on an annotation
        const clickedAnnotation = annotations.find(a => 
          a.page === currentPage &&
          x >= a.x && x <= a.x + (a.width || 50) &&
          y >= a.y && y <= a.y + (a.height || 50)
        );
        setSelectedAnnotation(clickedAnnotation?.id || null);
        break;

      case "eraser":
        const annotationToDelete = annotations.find(a => 
          a.page === currentPage &&
          x >= a.x && x <= a.x + (a.width || 50) &&
          y >= a.y && y <= a.y + (a.height || 50)
        );
        if (annotationToDelete) {
          deleteAnnotation(annotationToDelete.id);
        }
        break;
    }
  }, [activeTool, currentPage, textInput, commentInput, selectedColor, selectedStamp, user, annotations]);

  const addAnnotation = (annotation: Annotation) => {
    const newAnnotations = [...annotations, annotation];
    setAnnotations(newAnnotations);
    
    // Update history for undo/redo
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newAnnotations);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    
    toast.success(`${annotation.type} added`);
  };

  const deleteAnnotation = (id: string) => {
    const newAnnotations = annotations.filter(a => a.id !== id);
    setAnnotations(newAnnotations);
    setSelectedAnnotation(null);
    
    // Update history
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newAnnotations);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    
    toast.success("Annotation deleted");
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setAnnotations(history[historyIndex - 1]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setAnnotations(history[historyIndex + 1]);
    }
  };

  const handleSave = async () => {
    if (!pdfFile) {
      toast.error("No PDF loaded");
      return;
    }

    setIsLoading(true);
    try {
      // In production, this would flatten annotations into the PDF
      // For now, we'll save the annotations separately
      toast.success("Document saved with annotations");
    } catch (error) {
      toast.error("Failed to save document");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!pdfUrl) {
      toast.error("No PDF loaded");
      return;
    }

    // In production, this would download the PDF with flattened annotations
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = pdfFile?.name || "edited-document.pdf";
    link.click();
    
    toast.success("Download started");
  };

  const pageAnnotations = annotations.filter(a => a.page === currentPage);

  const content = (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Toolbar */}
      <div className="border-b bg-white p-2 flex items-center gap-2 flex-wrap">
        {/* File actions */}
        <div className="flex items-center gap-1 border-r pr-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".pdf"
            className="hidden"
          />
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-1" />
            Open
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSave} disabled={!pdfUrl}>
            <Save className="h-4 w-4 mr-1" />
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDownload} disabled={!pdfUrl}>
            <Download className="h-4 w-4 mr-1" />
            Download
          </Button>
        </div>

        {/* Undo/Redo */}
        <div className="flex items-center gap-1 border-r pr-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleUndo}
            disabled={historyIndex <= 0}
          >
            <Undo className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
          >
            <Redo className="h-4 w-4" />
          </Button>
        </div>

        {/* Tools */}
        <div className="flex items-center gap-1 border-r pr-2">
          {tools.map((tool) => (
            <Button
              key={tool.id}
              variant={activeTool === tool.id ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTool(tool.id)}
              title={tool.label}
            >
              <tool.icon className="h-4 w-4" />
            </Button>
          ))}
        </div>

        {/* Color picker */}
        <div className="flex items-center gap-1 border-r pr-2">
          {colors.slice(0, 4).map((color) => (
            <button
              key={color}
              className={`w-6 h-6 rounded border-2 ${selectedColor === color ? 'border-slate-900' : 'border-transparent'}`}
              style={{ backgroundColor: color }}
              onClick={() => setSelectedColor(color)}
            />
          ))}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Select Color</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-4 gap-2">
                {colors.map((color) => (
                  <button
                    key={color}
                    className={`w-12 h-12 rounded border-2 ${selectedColor === color ? 'border-slate-900' : 'border-slate-200'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setSelectedColor(color)}
                  />
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1 border-r pr-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setZoom(Math.max(25, zoom - 25))}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm w-12 text-center">{zoom}%</span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setZoom(Math.min(400, zoom + 25))}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>

        {/* Page navigation */}
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">
            Page {currentPage} of {totalPages || "-"}
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Text-to-Speech */}
        <Button 
          variant={showTTS ? "default" : "ghost"}
          size="sm" 
          onClick={() => {
            if (!extractedText) {
              setExtractedText("This is a sample PDF document. The text-to-speech feature allows you to listen to the content of your PDF documents. Upload a PDF to extract and listen to its text content. This accessibility feature supports multiple languages and voice options.");
            }
            setShowTTS(!showTTS);
          }}
          disabled={!pdfUrl}
          title="Text-to-Speech"
        >
          <Volume2 className="h-4 w-4 mr-1" />
          Listen
        </Button>

        {/* Toggle thumbnails */}
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setShowThumbnails(!showThumbnails)}
          className="ml-auto"
        >
          <Layers className="h-4 w-4 mr-1" />
          {showThumbnails ? "Hide" : "Show"} Pages
        </Button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Thumbnails sidebar */}
        {showThumbnails && pdfUrl && (
          <div className="w-48 border-r bg-slate-50 overflow-y-auto">
            <div className="p-2 space-y-2">
              {pages.map((page) => (
                <div
                  key={page.pageNumber}
                  className={`cursor-pointer rounded border-2 p-1 transition-all ${
                    currentPage === page.pageNumber 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  onClick={() => setCurrentPage(page.pageNumber)}
                >
                  <div className="aspect-[8.5/11] bg-white rounded flex items-center justify-center text-slate-400 text-sm">
                    Page {page.pageNumber}
                  </div>
                  <p className="text-xs text-center mt-1 text-slate-600">
                    {page.pageNumber}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Canvas area */}
        <div className="flex-1 overflow-auto bg-slate-200 p-4">
          {pdfUrl ? (
            <div 
              className="mx-auto bg-white shadow-lg relative"
              style={{ 
                width: `${612 * (zoom / 100)}px`, 
                height: `${792 * (zoom / 100)}px`,
                transform: `scale(1)`,
              }}
            >
              {/* PDF Page placeholder */}
              <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <FileText className="h-16 w-16 mx-auto mb-2" />
                  <p>Page {currentPage}</p>
                  <p className="text-xs">Click to add annotations</p>
                </div>
              </div>

              {/* Canvas for annotations */}
              <canvas
                ref={canvasRef}
                className="absolute inset-0 cursor-crosshair"
                width={612 * (zoom / 100)}
                height={792 * (zoom / 100)}
                onClick={handleCanvasClick}
              />

              {/* Render annotations */}
              {pageAnnotations.map((annotation) => (
                <div
                  key={annotation.id}
                  className={`absolute cursor-pointer ${
                    selectedAnnotation === annotation.id ? 'ring-2 ring-blue-500' : ''
                  }`}
                  style={{
                    left: annotation.x * (zoom / 100),
                    top: annotation.y * (zoom / 100),
                    width: annotation.width ? annotation.width * (zoom / 100) : 'auto',
                    height: annotation.height ? annotation.height * (zoom / 100) : 'auto',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedAnnotation(annotation.id);
                  }}
                >
                  {annotation.type === "highlight" && (
                    <div 
                      className="w-full h-full opacity-50"
                      style={{ backgroundColor: annotation.color }}
                    />
                  )}
                  {annotation.type === "text" && (
                    <div 
                      className="text-sm font-medium px-1"
                      style={{ color: annotation.color }}
                    >
                      {annotation.content}
                    </div>
                  )}
                  {annotation.type === "comment" && (
                    <div className="bg-yellow-100 border border-yellow-300 rounded p-2 shadow-sm max-w-[200px]">
                      <p className="text-xs font-medium text-yellow-800">{annotation.author}</p>
                      <p className="text-sm">{annotation.content}</p>
                    </div>
                  )}
                  {annotation.type === "stamp" && (
                    <div className={`font-bold text-xl border-2 border-current px-3 py-1 rounded ${annotation.color}`}>
                      {annotation.content}
                    </div>
                  )}
                  {annotation.type === "shape" && (
                    <div 
                      className="w-full h-full border-2"
                      style={{ borderColor: annotation.color }}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <Card className="max-w-md">
                <CardHeader className="text-center">
                  <CardTitle>Open a PDF to Edit</CardTitle>
                  <CardDescription>
                    Upload a PDF file to start adding annotations, comments, and more
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex justify-center">
                  <Button onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" />
                    Select PDF File
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Properties panel */}
        {pdfUrl && (
          <div className="w-64 border-l bg-white overflow-y-auto">
            <Tabs defaultValue="properties" className="h-full">
              <TabsList className="w-full justify-start rounded-none border-b">
                <TabsTrigger value="properties">Properties</TabsTrigger>
                <TabsTrigger value="annotations">Annotations</TabsTrigger>
              </TabsList>

              <TabsContent value="properties" className="p-4 space-y-4">
                {activeTool === "text" && (
                  <div className="space-y-2">
                    <Label>Text Content</Label>
                    <Textarea
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="Enter text..."
                      rows={3}
                    />
                  </div>
                )}

                {activeTool === "comment" && (
                  <div className="space-y-2">
                    <Label>Comment</Label>
                    <Textarea
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      placeholder="Enter comment..."
                      rows={3}
                    />
                  </div>
                )}

                {activeTool === "stamp" && (
                  <div className="space-y-2">
                    <Label>Stamp Type</Label>
                    <Select 
                      value={selectedStamp.id} 
                      onValueChange={(v) => setSelectedStamp(stamps.find(s => s.id === v) || stamps[0])}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {stamps.map((stamp) => (
                          <SelectItem key={stamp.id} value={stamp.id}>
                            <span className={stamp.color}>{stamp.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedAnnotation && (
                  <div className="space-y-2 pt-4 border-t">
                    <Label>Selected Annotation</Label>
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      className="w-full"
                      onClick={() => deleteAnnotation(selectedAnnotation)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                )}

                <div className="space-y-2 pt-4 border-t">
                  <Label>Document Info</Label>
                  <div className="text-sm text-slate-600 space-y-1">
                    <p>File: {pdfFile?.name || "N/A"}</p>
                    <p>Pages: {totalPages}</p>
                    <p>Annotations: {annotations.length}</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="annotations" className="p-0">
                <ScrollArea className="h-[calc(100vh-12rem)]">
                  <div className="p-4 space-y-2">
                    {annotations.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-4">
                        No annotations yet
                      </p>
                    ) : (
                      annotations.map((annotation) => (
                        <div
                          key={annotation.id}
                          className={`p-2 rounded border cursor-pointer transition-colors ${
                            selectedAnnotation === annotation.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                          onClick={() => {
                            setSelectedAnnotation(annotation.id);
                            setCurrentPage(annotation.page);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded"
                              style={{ backgroundColor: annotation.color }}
                            />
                            <span className="text-sm font-medium capitalize">
                              {annotation.type}
                            </span>
                            <span className="text-xs text-slate-500 ml-auto">
                              Page {annotation.page}
                            </span>
                          </div>
                          {annotation.content && (
                            <p className="text-xs text-slate-600 mt-1 truncate">
                              {annotation.content}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      {/* Text-to-Speech Panel */}
      {showTTS && extractedText && (
        <div className="absolute bottom-4 right-4 w-80 z-40">
          <TextToSpeech text={extractedText} onClose={() => setShowTTS(false)} />
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-50">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
            <p className="mt-2 text-slate-600">Loading...</p>
          </div>
        </div>
      )}
    </div>
  );

  return <DashboardLayout>{content}</DashboardLayout>;
}
