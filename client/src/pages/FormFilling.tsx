import { useState, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { 
  Upload, 
  FileText, 
  FormInput, 
  CheckSquare, 
  Circle, 
  List, 
  Download, 
  Trash2, 
  Save,
  Eye,
  Loader2,
  AlertCircle,
  CheckCircle,
  Type,
  ToggleLeft,
  ListOrdered,
  Calendar
} from "lucide-react";

type FormFieldType = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'signature' | 'date' | 'unknown';

interface FormField {
  name: string;
  type: FormFieldType;
  value: string | boolean | null;
  options?: string[];
  required?: boolean;
  readOnly?: boolean;
  maxLength?: number;
  multiline?: boolean;
}

interface FormSchema {
  totalFields: number;
  fields: FormField[];
  hasSignatureFields: boolean;
  pageCount: number;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
  };
}

export default function FormFilling() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [formSchema, setFormSchema] = useState<FormSchema | null>(null);
  const [formData, setFormData] = useState<Record<string, string | boolean>>({});
  const [flattenOnSave, setFlattenOnSave] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [filledPdfUrl, setFilledPdfUrl] = useState<string | null>(null);

  const uploadMutation = trpc.files.upload.useMutation();
  const detectFieldsMutation = trpc.forms.detectFields.useMutation();
  const fillFieldsMutation = trpc.forms.fillFields.useMutation();
  const clearFieldsMutation = trpc.forms.clearFields.useMutation();
  const extractDataMutation = trpc.forms.extractData.useMutation();

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error("Please select a PDF file");
      return;
    }

    setSelectedFile(file);
    setFormSchema(null);
    setFormData({});
    setFilledPdfUrl(null);
    setIsUploading(true);

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        
        // Upload file
        const uploadResult = await uploadMutation.mutateAsync({
          filename: file.name,
          mimeType: file.type,
          base64Data: base64,
          fileSize: file.size,
        });

        setUploadedFileUrl(uploadResult.url);

        // Detect form fields
        const schema = await detectFieldsMutation.mutateAsync({
          fileUrl: uploadResult.url,
        });

        setFormSchema(schema);

        // Initialize form data with existing values
        const initialData: Record<string, string | boolean> = {};
        for (const field of schema.fields) {
          if (field.value !== null) {
            initialData[field.name] = field.value;
          } else if (field.type === 'checkbox') {
            initialData[field.name] = false;
          } else {
            initialData[field.name] = '';
          }
        }
        setFormData(initialData);

        toast.success(`Detected ${schema.totalFields} form fields`);
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error("Failed to process PDF");
      setIsUploading(false);
    }
  }, [uploadMutation, detectFieldsMutation]);

  const handleFieldChange = (fieldName: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const handleSaveForm = async () => {
    if (!uploadedFileUrl || !formSchema) return;

    try {
      const result = await fillFieldsMutation.mutateAsync({
        fileUrl: uploadedFileUrl,
        formData,
        flatten: flattenOnSave,
      });

      if (result.success) {
        setFilledPdfUrl(result.url);
        toast.success(`Filled ${result.filledFields} of ${result.totalFields} fields`);
      } else {
        toast.warning(`Filled with warnings: ${result.errors?.join(', ')}`);
        setFilledPdfUrl(result.url);
      }
    } catch (error) {
      toast.error("Failed to save form");
    }
  };

  const handleClearForm = async () => {
    if (!uploadedFileUrl) return;

    try {
      const result = await clearFieldsMutation.mutateAsync({
        fileUrl: uploadedFileUrl,
      });

      // Reset form data
      const clearedData: Record<string, string | boolean> = {};
      for (const field of formSchema?.fields || []) {
        if (field.type === 'checkbox') {
          clearedData[field.name] = false;
        } else {
          clearedData[field.name] = '';
        }
      }
      setFormData(clearedData);
      setUploadedFileUrl(result.url);
      toast.success("Form cleared");
    } catch (error) {
      toast.error("Failed to clear form");
    }
  };

  const handleExtractData = async () => {
    if (!uploadedFileUrl) return;

    try {
      const data = await extractDataMutation.mutateAsync({
        fileUrl: uploadedFileUrl,
      });

      setFormData(data);
      toast.success("Extracted existing form data");
    } catch (error) {
      toast.error("Failed to extract form data");
    }
  };

  const getFieldIcon = (type: FormFieldType) => {
    switch (type) {
      case 'text': return <Type className="h-4 w-4" />;
      case 'checkbox': return <CheckSquare className="h-4 w-4" />;
      case 'radio': return <Circle className="h-4 w-4" />;
      case 'dropdown': return <List className="h-4 w-4" />;
      case 'date': return <Calendar className="h-4 w-4" />;
      case 'signature': return <FormInput className="h-4 w-4" />;
      default: return <FormInput className="h-4 w-4" />;
    }
  };

  const renderFormField = (field: FormField) => {
    const value = formData[field.name];

    switch (field.type) {
      case 'text':
        return (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={field.name} className="flex items-center gap-2">
              {getFieldIcon(field.type)}
              {field.name}
              {field.required && <span className="text-red-500">*</span>}
              {field.readOnly && <Badge variant="secondary" className="text-xs">Read-only</Badge>}
            </Label>
            <Input
              id={field.name}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              disabled={field.readOnly}
              maxLength={field.maxLength}
              placeholder={`Enter ${field.name}`}
            />
            {field.maxLength && (
              <p className="text-xs text-muted-foreground">
                {(typeof value === 'string' ? value : '').length} / {field.maxLength} characters
              </p>
            )}
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.name} className="flex items-center space-x-2">
            <Checkbox
              id={field.name}
              checked={value === true}
              onCheckedChange={(checked) => handleFieldChange(field.name, checked === true)}
              disabled={field.readOnly}
            />
            <Label htmlFor={field.name} className="flex items-center gap-2">
              {getFieldIcon(field.type)}
              {field.name}
              {field.required && <span className="text-red-500">*</span>}
            </Label>
          </div>
        );

      case 'radio':
        return (
          <div key={field.name} className="space-y-2">
            <Label className="flex items-center gap-2">
              {getFieldIcon(field.type)}
              {field.name}
              {field.required && <span className="text-red-500">*</span>}
            </Label>
            <RadioGroup
              value={typeof value === 'string' ? value : ''}
              onValueChange={(val) => handleFieldChange(field.name, val)}
              disabled={field.readOnly}
            >
              {field.options?.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <RadioGroupItem value={option} id={`${field.name}-${option}`} />
                  <Label htmlFor={`${field.name}-${option}`}>{option}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        );

      case 'dropdown':
        return (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={field.name} className="flex items-center gap-2">
              {getFieldIcon(field.type)}
              {field.name}
              {field.required && <span className="text-red-500">*</span>}
            </Label>
            <Select
              value={typeof value === 'string' ? value : ''}
              onValueChange={(val) => handleFieldChange(field.name, val)}
              disabled={field.readOnly}
            >
              <SelectTrigger>
                <SelectValue placeholder={`Select ${field.name}`} />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case 'date':
        return (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={field.name} className="flex items-center gap-2">
              {getFieldIcon(field.type)}
              {field.name}
              {field.required && <span className="text-red-500">*</span>}
            </Label>
            <Input
              id={field.name}
              type="date"
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              disabled={field.readOnly}
            />
          </div>
        );

      case 'signature':
        return (
          <div key={field.name} className="space-y-2">
            <Label className="flex items-center gap-2">
              {getFieldIcon(field.type)}
              {field.name}
              <Badge variant="outline" className="text-xs">Signature</Badge>
            </Label>
            <div className="border-2 border-dashed rounded-lg p-4 text-center text-muted-foreground">
              <FormInput className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">Signature fields require digital signature tools</p>
            </div>
          </div>
        );

      default:
        return (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={field.name} className="flex items-center gap-2">
              {getFieldIcon(field.type)}
              {field.name}
              <Badge variant="secondary" className="text-xs">Unknown type</Badge>
            </Label>
            <Input
              id={field.name}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              disabled={field.readOnly}
            />
          </div>
        );
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">PDF Form Filling</h1>
          <p className="text-muted-foreground">
            Upload a PDF with form fields, fill them out, and download the completed form.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Upload and Preview Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload PDF Form
              </CardTitle>
              <CardDescription>
                Select a PDF file with fillable form fields
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="pdf-upload"
                />
                <label htmlFor="pdf-upload" className="cursor-pointer">
                  {isUploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-10 w-10 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Processing PDF...</p>
                    </div>
                  ) : selectedFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="h-10 w-10 text-primary" />
                      <p className="font-medium">{selectedFile.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-10 w-10 text-muted-foreground" />
                      <p className="font-medium">Click to upload PDF</p>
                      <p className="text-sm text-muted-foreground">
                        or drag and drop
                      </p>
                    </div>
                  )}
                </label>
              </div>

              {formSchema && (
                <div className="space-y-4">
                  <Separator />
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span>{formSchema.pageCount} pages</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FormInput className="h-4 w-4 text-muted-foreground" />
                      <span>{formSchema.totalFields} fields</span>
                    </div>
                  </div>

                  {formSchema.metadata.title && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Title: </span>
                      {formSchema.metadata.title}
                    </div>
                  )}

                  {formSchema.hasSignatureFields && (
                    <div className="flex items-center gap-2 text-amber-600 text-sm">
                      <AlertCircle className="h-4 w-4" />
                      This form contains signature fields
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {formSchema.fields.filter(f => f.type === 'text').length > 0 && (
                      <Badge variant="outline">
                        <Type className="h-3 w-3 mr-1" />
                        {formSchema.fields.filter(f => f.type === 'text').length} Text
                      </Badge>
                    )}
                    {formSchema.fields.filter(f => f.type === 'checkbox').length > 0 && (
                      <Badge variant="outline">
                        <CheckSquare className="h-3 w-3 mr-1" />
                        {formSchema.fields.filter(f => f.type === 'checkbox').length} Checkbox
                      </Badge>
                    )}
                    {formSchema.fields.filter(f => f.type === 'dropdown').length > 0 && (
                      <Badge variant="outline">
                        <List className="h-3 w-3 mr-1" />
                        {formSchema.fields.filter(f => f.type === 'dropdown').length} Dropdown
                      </Badge>
                    )}
                    {formSchema.fields.filter(f => f.type === 'radio').length > 0 && (
                      <Badge variant="outline">
                        <Circle className="h-3 w-3 mr-1" />
                        {formSchema.fields.filter(f => f.type === 'radio').length} Radio
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Form Fields Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FormInput className="h-5 w-5" />
                Form Fields
              </CardTitle>
              <CardDescription>
                Fill in the form fields below
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!formSchema ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FormInput className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Upload a PDF to see form fields</p>
                </div>
              ) : formSchema.totalFields === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No fillable form fields detected</p>
                  <p className="text-sm mt-2">This PDF may not contain interactive form fields</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-6">
                    {formSchema.fields.map(renderFormField)}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Actions Section */}
        {formSchema && formSchema.totalFields > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="flatten"
                    checked={flattenOnSave}
                    onCheckedChange={setFlattenOnSave}
                  />
                  <Label htmlFor="flatten" className="text-sm">
                    Flatten form (make fields non-editable)
                  </Label>
                </div>

                <div className="flex-1" />

                <Button
                  variant="outline"
                  onClick={handleExtractData}
                  disabled={extractDataMutation.isPending}
                >
                  {extractDataMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Eye className="h-4 w-4 mr-2" />
                  )}
                  Extract Data
                </Button>

                <Button
                  variant="outline"
                  onClick={handleClearForm}
                  disabled={clearFieldsMutation.isPending}
                >
                  {clearFieldsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Clear Form
                </Button>

                <Button
                  onClick={handleSaveForm}
                  disabled={fillFieldsMutation.isPending}
                >
                  {fillFieldsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Filled PDF
                </Button>
              </div>

              {filledPdfUrl && (
                <div className="mt-4 p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Form saved successfully!</span>
                  </div>
                  <div className="mt-2">
                    <Button asChild variant="outline" size="sm">
                      <a href={filledPdfUrl} target="_blank" rel="noopener noreferrer">
                        <Download className="h-4 w-4 mr-2" />
                        Download Filled PDF
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
