import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Alert, AlertDescription } from '../ui/alert';
import {
  File,
  Download,
  Eye,
  Trash2,
  FileText,
  Image,
  FileSpreadsheet,
  AlertCircle,
  Calendar,
  Tag
} from 'lucide-react';
import { formatBytes, formatDateTime } from '../../utils/format';

export interface Document {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  entityType?: string;
  entityId?: string;
  uploadedBy: string;
  uploadedAt: string;
  tags: string[];
  metadata: Record<string, any>;
  isActive: boolean;
}

export interface DocumentGalleryProps {
  entityType?: string;
  entityId?: string;
  documents?: Document[];
  onDocumentDelete?: (documentId: string) => void;
  onRefresh?: () => void;
  showUploadButton?: boolean;
  onUploadClick?: () => void;
}

export const DocumentGallery: React.FC<DocumentGalleryProps> = ({
  entityType,
  entityId,
  documents: propDocuments,
  onDocumentDelete,
  onRefresh,
  showUploadButton = false,
  onUploadClick,
}) => {
  const [documents, setDocuments] = useState<Document[]>(propDocuments || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Fetch documents if entityType and entityId are provided
  useEffect(() => {
    if (entityType && entityId && !propDocuments) {
      fetchDocuments();
    }
  }, [entityType, entityId, propDocuments]);

  // Update documents when props change
  useEffect(() => {
    if (propDocuments) {
      setDocuments(propDocuments);
    }
  }, [propDocuments]);

  const fetchDocuments = async () => {
    if (!entityType || !entityId) return;

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(
        `/api/documents/entity/${entityType}/${entityId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }

      const result = await response.json();
      if (result.success) {
        setDocuments(result.data);
      } else {
        throw new Error(result.error || 'Failed to fetch documents');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch documents');
    } finally {
      setLoading(false);
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <Image className="h-5 w-5 text-blue-500" />;
    } else if (mimeType === 'application/pdf') {
      return <FileText className="h-5 w-5 text-red-500" />;
    } else if (
      mimeType.includes('spreadsheet') ||
      mimeType.includes('excel')
    ) {
      return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
    }
    return <File className="h-5 w-5 text-muted-foreground" />;
  };

  const handlePreview = async (document: Document) => {
    setSelectedDocument(document);

    // For images and PDFs, we can show a preview
    if (document.mimeType.startsWith('image/') || document.mimeType === 'application/pdf') {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`/api/documents/${document.id}/file`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
        }
      } catch (err) {
        console.error('Failed to load preview:', err);
      }
    }
  };

  const handleDownload = async (documentItem: Document) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/documents/${documentItem.id}/file`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to download file');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const a = window.document.createElement('a');
      a.href = url;
      a.download = documentItem.originalName;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download file');
    }
  };

  const handleDelete = async (document: Document) => {
    if (!confirm(`Are you sure you want to delete "${document.originalName}"?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/documents/${document.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete document');
      }

      // Remove from local state
      setDocuments(prev => prev.filter(d => d.id !== document.id));

      // Notify parent component
      onDocumentDelete?.(document.id);

      // Refresh if needed
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document');
    }
  };

  const closePreview = () => {
    setSelectedDocument(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-6">
          <div className="text-center">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-muted-foreground">Loading documents...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <File className="h-5 w-5" />
                Documents ({documents.length})
              </CardTitle>
              <CardDescription>
                Attached documents and files
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {onRefresh && (
                <Button variant="outline" size="sm" onClick={onRefresh}>
                  Refresh
                </Button>
              )}
              {showUploadButton && onUploadClick && (
                <Button size="sm" onClick={onUploadClick}>
                  Upload Document
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <File className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-lg font-medium">No documents uploaded</p>
              <p className="text-sm">
                {showUploadButton
                  ? 'Click the upload button to add documents'
                  : 'Documents will appear here once uploaded'
                }
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    {getFileIcon(doc.mimeType)}
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePreview(doc)}
                        title="Preview"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(doc)}
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(doc)}
                        title="Delete"
                        className="text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-medium text-sm truncate" title={doc.originalName}>
                      {doc.originalName}
                    </h4>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatBytes(doc.size)}</span>
                      <span>•</span>
                      <span>{doc.mimeType.split('/')[1].toUpperCase()}</span>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatDateTime(doc.uploadedAt)}
                    </div>

                    {doc.tags && doc.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {doc.tags.slice(0, 3).map((tag, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {doc.tags.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{doc.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={!!selectedDocument} onOpenChange={closePreview}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedDocument && getFileIcon(selectedDocument.mimeType)}
              {selectedDocument?.originalName}
            </DialogTitle>
          </DialogHeader>

          {selectedDocument && (
            <div className="space-y-4">
              {/* Document Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <File className="h-4 w-4" />
                    <span className="font-medium">Size:</span>
                    <span>{formatBytes(selectedDocument.size)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span className="font-medium">Uploaded:</span>
                    <span>{formatDateTime(selectedDocument.uploadedAt)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Type:</span>
                    <span>{selectedDocument.mimeType}</span>
                  </div>
                  {selectedDocument.tags.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      <span className="font-medium">Tags:</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedDocument.tags.map((tag, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Preview */}
              {previewUrl && (
                <div className="border rounded-lg overflow-hidden max-h-96">
                  {selectedDocument.mimeType.startsWith('image/') ? (
                    <img
                      src={previewUrl}
                      alt={selectedDocument.originalName}
                      className="w-full h-full object-contain"
                    />
                  ) : selectedDocument.mimeType === 'application/pdf' ? (
                    <iframe
                      src={previewUrl}
                      className="w-full h-96"
                      title={selectedDocument.originalName}
                    />
                  ) : null}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => selectedDocument && handleDownload(selectedDocument)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button variant="outline" onClick={closePreview}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};