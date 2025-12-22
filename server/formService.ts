/**
 * PDF Form Filling Service
 * Handles form field detection, extraction, and filling using pdf-lib
 */

import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFName } from 'pdf-lib';
import { storagePut } from './storage';
import { nanoid } from 'nanoid';

// Form field types
export type FormFieldType = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'signature' | 'date' | 'unknown';

export interface FormField {
  name: string;
  type: FormFieldType;
  value: string | boolean | null;
  options?: string[]; // For dropdowns and radio buttons
  required?: boolean;
  readOnly?: boolean;
  maxLength?: number;
  multiline?: boolean;
  page?: number;
  rect?: { x: number; y: number; width: number; height: number };
}

export interface FormSchema {
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

export interface FormFillData {
  [fieldName: string]: string | boolean;
}

export interface FormFillResult {
  success: boolean;
  url: string;
  fileKey: string;
  filledFields: number;
  totalFields: number;
  errors?: string[];
}

/**
 * Detect and extract form fields from a PDF
 */
export async function detectFormFields(pdfBuffer: Buffer): Promise<FormSchema> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  
  const formFields: FormField[] = [];
  let hasSignatureFields = false;
  
  for (const field of fields) {
    const fieldName = field.getName();
    const fieldType = getFieldType(field);
    
    if (fieldType === 'signature') {
      hasSignatureFields = true;
    }
    
    const formField: FormField = {
      name: fieldName,
      type: fieldType,
      value: getFieldValue(field),
      readOnly: field.isReadOnly(),
    };
    
    // Get field-specific properties
    if (field instanceof PDFTextField) {
      formField.maxLength = field.getMaxLength();
      formField.multiline = field.isMultiline();
    }
    
    if (field instanceof PDFDropdown) {
      formField.options = field.getOptions();
    }
    
    if (field instanceof PDFRadioGroup) {
      formField.options = field.getOptions();
    }
    
    formFields.push(formField);
  }
  
  // Get PDF metadata
  const metadata = {
    title: pdfDoc.getTitle() || undefined,
    author: pdfDoc.getAuthor() || undefined,
    subject: pdfDoc.getSubject() || undefined,
    creator: pdfDoc.getCreator() || undefined,
  };
  
  return {
    totalFields: formFields.length,
    fields: formFields,
    hasSignatureFields,
    pageCount: pdfDoc.getPageCount(),
    metadata,
  };
}

/**
 * Get the type of a form field
 */
function getFieldType(field: any): FormFieldType {
  if (field instanceof PDFTextField) {
    return 'text';
  }
  if (field instanceof PDFCheckBox) {
    return 'checkbox';
  }
  if (field instanceof PDFDropdown) {
    return 'dropdown';
  }
  if (field instanceof PDFRadioGroup) {
    return 'radio';
  }
  
  // Check for signature field by constructor name
  const constructorName = field.constructor.name;
  if (constructorName.includes('Signature') || constructorName.includes('Sig')) {
    return 'signature';
  }
  
  return 'unknown';
}

/**
 * Get the current value of a form field
 */
function getFieldValue(field: any): string | boolean | null {
  try {
    if (field instanceof PDFTextField) {
      return field.getText() || null;
    }
    if (field instanceof PDFCheckBox) {
      return field.isChecked();
    }
    if (field instanceof PDFDropdown) {
      const selected = field.getSelected();
      return selected.length > 0 ? selected[0] : null;
    }
    if (field instanceof PDFRadioGroup) {
      return field.getSelected() || null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Fill form fields in a PDF
 */
export async function fillFormFields(
  pdfBuffer: Buffer,
  formData: FormFillData,
  options: {
    flatten?: boolean; // Make fields non-editable after filling
    userId?: number;
  } = {}
): Promise<FormFillResult> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  
  let filledFields = 0;
  const errors: string[] = [];
  
  for (const [fieldName, value] of Object.entries(formData)) {
    try {
      const field = form.getField(fieldName);
      
      if (!field) {
        errors.push(`Field "${fieldName}" not found`);
        continue;
      }
      
      if (field.isReadOnly()) {
        errors.push(`Field "${fieldName}" is read-only`);
        continue;
      }
      
      // Fill based on field type
      if (field instanceof PDFTextField) {
        field.setText(String(value));
        filledFields++;
      } else if (field instanceof PDFCheckBox) {
        if (value === true || value === 'true' || value === 'yes' || value === '1') {
          field.check();
        } else {
          field.uncheck();
        }
        filledFields++;
      } else if (field instanceof PDFDropdown) {
        field.select(String(value));
        filledFields++;
      } else if (field instanceof PDFRadioGroup) {
        field.select(String(value));
        filledFields++;
      }
    } catch (err) {
      errors.push(`Error filling field "${fieldName}": ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }
  
  // Flatten form if requested (makes fields non-editable)
  if (options.flatten) {
    form.flatten();
  }
  
  // Save the filled PDF
  const filledPdfBytes = await pdfDoc.save();
  const fileKey = `forms/${options.userId || 'anonymous'}/${nanoid()}-filled.pdf`;
  
  const { url } = await storagePut(fileKey, Buffer.from(filledPdfBytes), 'application/pdf');
  
  return {
    success: errors.length === 0,
    url,
    fileKey,
    filledFields,
    totalFields: fields.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Create a new PDF with form fields
 */
export async function createFormPdf(
  fields: Array<{
    name: string;
    type: FormFieldType;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    options?: string[];
    defaultValue?: string | boolean;
  }>,
  options: {
    pageSize?: { width: number; height: number };
    pageCount?: number;
    userId?: number;
  } = {}
): Promise<{ url: string; fileKey: string }> {
  const pdfDoc = await PDFDocument.create();
  const pageCount = options.pageCount || 1;
  const pageSize = options.pageSize || { width: 612, height: 792 }; // Letter size
  
  // Create pages
  const pages: any[] = [];
  for (let i = 0; i < pageCount; i++) {
    pages.push(pdfDoc.addPage([pageSize.width, pageSize.height]));
  }
  
  const form = pdfDoc.getForm();
  
  // Add fields
  for (const fieldDef of fields) {
    const page = pages[fieldDef.page] || pages[0];
    
    switch (fieldDef.type) {
      case 'text':
        const textField = form.createTextField(fieldDef.name);
        textField.addToPage(page, {
          x: fieldDef.x,
          y: fieldDef.y,
          width: fieldDef.width,
          height: fieldDef.height,
        });
        if (fieldDef.defaultValue) {
          textField.setText(String(fieldDef.defaultValue));
        }
        break;
        
      case 'checkbox':
        const checkbox = form.createCheckBox(fieldDef.name);
        checkbox.addToPage(page, {
          x: fieldDef.x,
          y: fieldDef.y,
          width: fieldDef.width,
          height: fieldDef.height,
        });
        if (fieldDef.defaultValue === true) {
          checkbox.check();
        }
        break;
        
      case 'dropdown':
        if (fieldDef.options && fieldDef.options.length > 0) {
          const dropdown = form.createDropdown(fieldDef.name);
          dropdown.addOptions(fieldDef.options);
          dropdown.addToPage(page, {
            x: fieldDef.x,
            y: fieldDef.y,
            width: fieldDef.width,
            height: fieldDef.height,
          });
          if (fieldDef.defaultValue) {
            dropdown.select(String(fieldDef.defaultValue));
          }
        }
        break;
        
      case 'radio':
        if (fieldDef.options && fieldDef.options.length > 0) {
          const radioGroup = form.createRadioGroup(fieldDef.name);
          // Add radio buttons for each option
          let offsetY = 0;
          for (const option of fieldDef.options) {
            radioGroup.addOptionToPage(option, page, {
              x: fieldDef.x,
              y: fieldDef.y - offsetY,
              width: fieldDef.width,
              height: 20,
            });
            offsetY += 25;
          }
          if (fieldDef.defaultValue) {
            radioGroup.select(String(fieldDef.defaultValue));
          }
        }
        break;
    }
  }
  
  const pdfBytes = await pdfDoc.save();
  const fileKey = `forms/${options.userId || 'anonymous'}/${nanoid()}-form.pdf`;
  
  const { url } = await storagePut(fileKey, Buffer.from(pdfBytes), 'application/pdf');
  
  return { url, fileKey };
}

/**
 * Validate form data against form schema
 */
export function validateFormData(
  schema: FormSchema,
  formData: FormFillData
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (const field of schema.fields) {
    const value = formData[field.name];
    
    // Check required fields
    if (field.required && (value === undefined || value === null || value === '')) {
      errors.push(`Field "${field.name}" is required`);
      continue;
    }
    
    // Skip validation if no value provided
    if (value === undefined || value === null) {
      continue;
    }
    
    // Validate based on field type
    switch (field.type) {
      case 'text':
        if (field.maxLength && String(value).length > field.maxLength) {
          errors.push(`Field "${field.name}" exceeds maximum length of ${field.maxLength}`);
        }
        break;
        
      case 'dropdown':
      case 'radio':
        if (field.options && !field.options.includes(String(value))) {
          errors.push(`Field "${field.name}" has invalid option: ${value}`);
        }
        break;
        
      case 'checkbox':
        if (typeof value !== 'boolean' && !['true', 'false', 'yes', 'no', '1', '0'].includes(String(value).toLowerCase())) {
          errors.push(`Field "${field.name}" must be a boolean value`);
        }
        break;
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extract form data from a filled PDF
 */
export async function extractFormData(pdfBuffer: Buffer): Promise<FormFillData> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  
  const formData: FormFillData = {};
  
  for (const field of fields) {
    const fieldName = field.getName();
    const value = getFieldValue(field);
    
    if (value !== null) {
      formData[fieldName] = value;
    }
  }
  
  return formData;
}

/**
 * Clear all form fields in a PDF
 */
export async function clearFormFields(
  pdfBuffer: Buffer,
  options: {
    userId?: number;
  } = {}
): Promise<{ url: string; fileKey: string }> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  
  for (const field of fields) {
    try {
      if (field instanceof PDFTextField) {
        field.setText('');
      } else if (field instanceof PDFCheckBox) {
        field.uncheck();
      } else if (field instanceof PDFDropdown) {
        // Clear selection by selecting empty if possible
        const options = field.getOptions();
        if (options.length > 0) {
          field.clear();
        }
      } else if (field instanceof PDFRadioGroup) {
        // Radio groups can't be fully cleared, but we can try
        field.clear();
      }
    } catch {
      // Skip fields that can't be cleared
    }
  }
  
  const pdfBytes = await pdfDoc.save();
  const fileKey = `forms/${options.userId || 'anonymous'}/${nanoid()}-cleared.pdf`;
  
  const { url } = await storagePut(fileKey, Buffer.from(pdfBytes), 'application/pdf');
  
  return { url, fileKey };
}
