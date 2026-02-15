import React, { useCallback, useState } from 'react';
import { Upload, File, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface DocumentUploadProps {
  onUploadSuccess?: (documentId: string) => void;
  onRemove?: (documentId: string) => void;
  maxFiles?: number;
  maxSizeBytes?: number;
  acceptedTypes?: string[];
  className?: string;
}

interface UploadedDocument {
  id: string;
  filename: string;
  size: number;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({
  onUploadSuccess,
  onRemove,
  maxFiles = 5,
  maxSizeBytes = 10 * 1024 * 1024, // 10MB
  acceptedTypes = ['image/*', 'application/pdf', '.doc', '.docx', '.xlsx'],
  className
}) => {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const uploadDocument = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/expenses/documents/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    const result = await response.json();
    return result.data.id;
  };

  const handleFileUpload = useCallback(async (files: FileList) => {
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files).slice(0, maxFiles - documents.length);

    for (const file of newFiles) {
      if (file.size > maxSizeBytes) {
        alert(`File ${file.name} is too large. Maximum size is ${Math.round(maxSizeBytes / (1024 * 1024))}MB`);
        continue;
      }

      const tempId = Math.random().toString(36).substr(2, 9);
      const newDoc: UploadedDocument = {
        id: tempId,
        filename: file.name,
        size: file.size,
        status: 'uploading'
      };

      setDocuments(prev => [...prev, newDoc]);

      try {
        const documentId = await uploadDocument(file);

        setDocuments(prev => prev.map(doc =>
          doc.id === tempId
            ? { ...doc, id: documentId, status: 'success' as const }
            : doc
        ));

        onUploadSuccess?.(documentId);
      } catch (error) {
        setDocuments(prev => prev.map(doc =>
          doc.id === tempId
            ? { ...doc, status: 'error' as const, error: 'Upload failed' }
            : doc
        ));
      }
    }
  }, [documents.length, maxFiles, maxSizeBytes, onUploadSuccess]);

  const handleRemove = (documentId: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== documentId));
    onRemove?.(documentId);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const canUploadMore = documents.length < maxFiles;

  return (
    <div className={cn('space-y-4', className)}>
      {canUploadMore && (
        <Card
          className={cn(
            'border-2 border-dashed transition-colors',
            isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300',
            'hover:border-gray-400'
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <CardContent className="p-6 text-center">
            <Upload className="h-10 w-10 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 mb-2">Drop files here or click to upload</p>
            <p className="text-sm text-gray-500 mb-4">
              Support: {acceptedTypes.join(', ')} (max {Math.round(maxSizeBytes / (1024 * 1024))}MB)
            </p>
            <input
              type="file"
              multiple
              accept={acceptedTypes.join(',')}
              onChange={(e) => handleFileUpload(e.target.files!)}
              className="hidden"
              id="file-upload"
              aria-label="Upload expense documents"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              Choose Files
            </Button>
          </CardContent>
        </Card>
      )}

      {documents.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Uploaded Documents</h4>
          {documents.map((doc) => (
            <Card key={doc.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <File className={cn(
                    'h-4 w-4 flex-shrink-0',
                    doc.status === 'success' ? 'text-green-500' :
                      doc.status === 'error' ? 'text-red-500' : 'text-gray-400'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.filename}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(doc.size)}</p>
                    {doc.status === 'error' && doc.error && (
                      <p className="text-xs text-red-600">{doc.error}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {doc.status === 'uploading' && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  )}
                  {doc.status === 'error' && (
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(doc.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!canUploadMore && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Maximum number of files ({maxFiles}) reached.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};