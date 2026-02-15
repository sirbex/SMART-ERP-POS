import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Alert, AlertDescription } from '../ui/alert';
import { Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react';
import { formatBytes } from '../../utils/format';

export interface DocumentUploadProps {
  onUploadSuccess?: (document: any) => void;
  onUploadError?: (error: string) => void;
  entityType?: string;
  entityId?: string;
  allowedTypes?: string[];
  maxFileSize?: number;
  multiple?: boolean;
}

interface UploadFile {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  result?: any;
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({
  onUploadSuccess,
  onUploadError,
  entityType,
  entityId,
  allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  maxFileSize = 10 * 1024 * 1024, // 10MB
  multiple = true,
}) => {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [tags, setTags] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    // Handle rejected files
    if (rejectedFiles.length > 0) {
      const errors = rejectedFiles.map(({ file, errors }) =>
        `${file.name}: ${errors.map((e: any) => e.message).join(', ')}`
      );
      onUploadError?.(errors.join('; '));
    }

    // Add accepted files to upload queue
    const newFiles: UploadFile[] = acceptedFiles.map(file => ({
      file,
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      progress: 0,
      status: 'pending' as const,
    }));

    setFiles(prev => [...prev, ...newFiles]);
  }, [onUploadError]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: allowedTypes.reduce((acc, type) => {
      acc[type] = [];
      return acc;
    }, {} as Record<string, string[]>),
    maxSize: maxFileSize,
    multiple,
  });

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const uploadFile = async (uploadFile: UploadFile): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      try {
        // Update file status to uploading
        setFiles(prev => prev.map(f =>
          f.id === uploadFile.id
            ? { ...f, status: 'uploading', progress: 0 }
            : f
        ));

        const formData = new FormData();
        formData.append('file', uploadFile.file);

        // Add metadata
        const metadata = {
          entityType,
          entityId,
          tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          metadata: {
            uploadedVia: 'web-interface',
            timestamp: new Date().toISOString(),
          },
        };

        formData.append('data', JSON.stringify(metadata));

        // Get auth token
        const token = localStorage.getItem('auth_token');
        if (!token) {
          throw new Error('Authentication token not found');
        }

        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 100;
            setFiles(prev => prev.map(f =>
              f.id === uploadFile.id
                ? { ...f, progress: Math.round(progress) }
                : f
            ));
          }
        };

        xhr.onload = () => {
          if (xhr.status === 200) {
            try {
              const result = JSON.parse(xhr.responseText);
              if (result.success) {
                setFiles(prev => prev.map(f =>
                  f.id === uploadFile.id
                    ? { ...f, status: 'success', progress: 100, result: result.data }
                    : f
                ));
                onUploadSuccess?.(result.data);
                resolve();
              } else {
                throw new Error(result.error || 'Upload failed');
              }
            } catch (parseError) {
              throw new Error('Invalid response from server');
            }
          } else {
            throw new Error(`Upload failed with status ${xhr.status}`);
          }
        };

        xhr.onerror = () => {
          throw new Error('Network error during upload');
        };

        xhr.open('POST', '/api/documents/upload');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';

        setFiles(prev => prev.map(f =>
          f.id === uploadFile.id
            ? { ...f, status: 'error', error: errorMessage }
            : f
        ));

        onUploadError?.(errorMessage);
        reject(error);
      }
    });
  };

  const uploadAllFiles = async () => {
    if (files.length === 0) return;

    setIsUploading(true);

    try {
      const pendingFiles = files.filter(f => f.status === 'pending');

      // Upload files sequentially to avoid overwhelming the server
      for (const file of pendingFiles) {
        await uploadFile(file);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const clearCompletedFiles = () => {
    setFiles(prev => prev.filter(f => f.status === 'pending' || f.status === 'uploading'));
  };

  const getStatusIcon = (status: UploadFile['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'uploading':
        return <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
      default:
        return <File className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const hasCompletedFiles = files.some(f => f.status === 'success' || f.status === 'error');
  const hasPendingFiles = files.some(f => f.status === 'pending');

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Document Upload
        </CardTitle>
        <CardDescription>
          Upload documents to attach to this record. Drag and drop files or click to select.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Area */}
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${isDragActive
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
            }
          `}
        >
          <input {...getInputProps()} />
          <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          {isDragActive ? (
            <p className="text-lg font-medium">Drop the files here...</p>
          ) : (
            <div>
              <p className="text-lg font-medium mb-2">
                Drag & drop files here, or click to select
              </p>
              <p className="text-sm text-muted-foreground">
                Supports: PDF, Images, Word, Excel (max {formatBytes(maxFileSize)})
              </p>
            </div>
          )}
        </div>

        {/* Tags Input */}
        <div className="space-y-2">
          <Label htmlFor="tags">Tags (comma-separated)</Label>
          <Input
            id="tags"
            placeholder="e.g., receipt, expense, office-supplies"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Files to Upload ({files.length})</Label>
              <div className="flex gap-2">
                {hasCompletedFiles && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearCompletedFiles}
                  >
                    Clear Completed
                  </Button>
                )}
                {hasPendingFiles && (
                  <Button
                    size="sm"
                    onClick={uploadAllFiles}
                    disabled={isUploading}
                  >
                    {isUploading ? 'Uploading...' : 'Upload All'}
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {files.map((uploadFile) => (
                <div
                  key={uploadFile.id}
                  className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50"
                >
                  {getStatusIcon(uploadFile.status)}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">
                        {uploadFile.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(uploadFile.file.size)}
                      </p>
                    </div>

                    {uploadFile.status === 'uploading' && (
                      <Progress value={uploadFile.progress} className="mt-1 h-1" />
                    )}

                    {uploadFile.error && (
                      <Alert className="mt-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          {uploadFile.error}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  {uploadFile.status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(uploadFile.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}

                  {uploadFile.status === 'success' && (
                    <Badge variant="secondary" className="text-green-600">
                      Uploaded
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};