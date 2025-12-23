/**
 * Cloud Storage Service
 * Provides integrations with Google Drive, Dropbox, and OneDrive
 */

import { ENV } from './_core/env';

// Types for cloud storage providers
export type CloudProvider = 'google_drive' | 'dropbox' | 'onedrive' | 'box';

export interface CloudFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  path?: string;
  thumbnailUrl?: string;
  downloadUrl?: string;
}

export interface CloudFolder {
  id: string;
  name: string;
  path?: string;
}

export interface CloudStorageConfig {
  provider: CloudProvider;
  accessToken: string;
  refreshToken?: string;
}

export interface ListFilesOptions {
  folderId?: string;
  pageToken?: string;
  pageSize?: number;
  query?: string;
  mimeTypes?: string[];
}

export interface ListFilesResult {
  files: CloudFile[];
  folders: CloudFolder[];
  nextPageToken?: string;
}

// OAuth configuration URLs
export const OAUTH_CONFIG = {
  google_drive: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
    apiBase: 'https://www.googleapis.com/drive/v3',
  },
  dropbox: {
    authUrl: 'https://www.dropbox.com/oauth2/authorize',
    tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
    scope: 'files.content.read files.content.write',
    apiBase: 'https://api.dropboxapi.com/2',
  },
  onedrive: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'Files.Read Files.ReadWrite',
    apiBase: 'https://graph.microsoft.com/v1.0',
  },
  box: {
    authUrl: 'https://account.box.com/api/oauth2/authorize',
    tokenUrl: 'https://api.box.com/oauth2/token',
    scope: 'root_readwrite',
    apiBase: 'https://api.box.com/2.0',
  },
};

/**
 * Generate OAuth authorization URL for a cloud provider
 */
export function getAuthUrl(
  provider: CloudProvider,
  clientId: string,
  redirectUri: string,
  state?: string
): string {
  const config = OAUTH_CONFIG[provider];
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scope,
    access_type: 'offline',
    prompt: 'consent',
  });

  if (state) {
    params.set('state', state);
  }

  // Provider-specific adjustments
  if (provider === 'dropbox') {
    params.set('token_access_type', 'offline');
  }

  return `${config.authUrl}?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  provider: CloudProvider,
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}> {
  const config = OAUTH_CONFIG[provider];

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code: ${error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(
  provider: CloudProvider,
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{
  accessToken: string;
  expiresIn?: number;
}> {
  const config = OAUTH_CONFIG[provider];

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Google Drive API wrapper
 */
export class GoogleDriveService {
  private accessToken: string;
  private apiBase = OAUTH_CONFIG.google_drive.apiBase;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async listFiles(options: ListFilesOptions = {}): Promise<ListFilesResult> {
    const params = new URLSearchParams({
      pageSize: String(options.pageSize || 50),
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,thumbnailLink,webContentLink)',
    });

    if (options.pageToken) {
      params.set('pageToken', options.pageToken);
    }

    // Build query
    const queryParts: string[] = [];
    if (options.folderId) {
      queryParts.push(`'${options.folderId}' in parents`);
    }
    if (options.query) {
      queryParts.push(`name contains '${options.query}'`);
    }
    if (options.mimeTypes && options.mimeTypes.length > 0) {
      const mimeQuery = options.mimeTypes.map(m => `mimeType='${m}'`).join(' or ');
      queryParts.push(`(${mimeQuery})`);
    }
    queryParts.push('trashed=false');

    params.set('q', queryParts.join(' and '));

    const response = await fetch(`${this.apiBase}/files?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Google Drive API error: ${response.statusText}`);
    }

    const data = await response.json();

    const files: CloudFile[] = [];
    const folders: CloudFolder[] = [];

    for (const item of data.files || []) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        folders.push({
          id: item.id,
          name: item.name,
        });
      } else {
        files.push({
          id: item.id,
          name: item.name,
          mimeType: item.mimeType,
          size: parseInt(item.size || '0', 10),
          modifiedTime: item.modifiedTime,
          thumbnailUrl: item.thumbnailLink,
          downloadUrl: item.webContentLink,
        });
      }
    }

    return {
      files,
      folders,
      nextPageToken: data.nextPageToken,
    };
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const response = await fetch(`${this.apiBase}/files/${fileId}?alt=media`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async uploadFile(
    name: string,
    content: Buffer,
    mimeType: string,
    folderId?: string
  ): Promise<CloudFile> {
    const metadata: Record<string, unknown> = {
      name,
      mimeType,
    };

    if (folderId) {
      metadata.parents = [folderId];
    }

    // Use multipart upload
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const body = Buffer.concat([
      Buffer.from(
        delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          `Content-Type: ${mimeType}\r\n` +
          'Content-Transfer-Encoding: base64\r\n\r\n'
      ),
      Buffer.from(content.toString('base64')),
      Buffer.from(closeDelimiter),
    ]);

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to upload file: ${error}`);
    }

    const data = await response.json();

    return {
      id: data.id,
      name: data.name,
      mimeType: data.mimeType,
      size: parseInt(data.size || '0', 10),
      modifiedTime: data.modifiedTime,
    };
  }
}

/**
 * Dropbox API wrapper
 */
export class DropboxService {
  private accessToken: string;
  private apiBase = OAUTH_CONFIG.dropbox.apiBase;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async listFiles(options: ListFilesOptions = {}): Promise<ListFilesResult> {
    const path = options.folderId || '';
    
    const response = await fetch(`${this.apiBase}/files/list_folder`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: path === 'root' ? '' : path,
        limit: options.pageSize || 50,
        include_media_info: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Dropbox API error: ${response.statusText}`);
    }

    const data = await response.json();

    const files: CloudFile[] = [];
    const folders: CloudFolder[] = [];

    for (const entry of data.entries || []) {
      if (entry['.tag'] === 'folder') {
        folders.push({
          id: entry.path_lower,
          name: entry.name,
          path: entry.path_display,
        });
      } else {
        files.push({
          id: entry.id,
          name: entry.name,
          mimeType: this.getMimeType(entry.name),
          size: entry.size || 0,
          modifiedTime: entry.server_modified,
          path: entry.path_display,
        });
      }
    }

    return {
      files,
      folders,
      nextPageToken: data.has_more ? data.cursor : undefined,
    };
  }

  async downloadFile(path: string): Promise<Buffer> {
    const response = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({ path }),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async uploadFile(
    path: string,
    content: Buffer,
    mode: 'add' | 'overwrite' = 'add'
  ): Promise<CloudFile> {
    const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
          path,
          mode,
          autorename: true,
        }),
      },
      body: new Uint8Array(content),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to upload file: ${error}`);
    }

    const data = await response.json();

    return {
      id: data.id,
      name: data.name,
      mimeType: this.getMimeType(data.name),
      size: data.size,
      modifiedTime: data.server_modified,
      path: data.path_display,
    };
  }

  private getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      txt: 'text/plain',
      html: 'text/html',
      md: 'text/markdown',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }
}

/**
 * OneDrive API wrapper
 */
export class OneDriveService {
  private accessToken: string;
  private apiBase = OAUTH_CONFIG.onedrive.apiBase;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async listFiles(options: ListFilesOptions = {}): Promise<ListFilesResult> {
    let url = `${this.apiBase}/me/drive/root/children`;
    
    if (options.folderId && options.folderId !== 'root') {
      url = `${this.apiBase}/me/drive/items/${options.folderId}/children`;
    }

    const params = new URLSearchParams({
      $top: String(options.pageSize || 50),
      $select: 'id,name,file,folder,size,lastModifiedDateTime,@microsoft.graph.downloadUrl',
    });

    if (options.pageToken) {
      url = options.pageToken; // OneDrive uses full URL for pagination
    } else {
      url = `${url}?${params.toString()}`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`OneDrive API error: ${response.statusText}`);
    }

    const data = await response.json();

    const files: CloudFile[] = [];
    const folders: CloudFolder[] = [];

    for (const item of data.value || []) {
      if (item.folder) {
        folders.push({
          id: item.id,
          name: item.name,
        });
      } else {
        files.push({
          id: item.id,
          name: item.name,
          mimeType: item.file?.mimeType || 'application/octet-stream',
          size: item.size || 0,
          modifiedTime: item.lastModifiedDateTime,
          downloadUrl: item['@microsoft.graph.downloadUrl'],
        });
      }
    }

    return {
      files,
      folders,
      nextPageToken: data['@odata.nextLink'],
    };
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    // First get the download URL
    const response = await fetch(`${this.apiBase}/me/drive/items/${fileId}/content`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async uploadFile(
    name: string,
    content: Buffer,
    folderId?: string
  ): Promise<CloudFile> {
    let url = `${this.apiBase}/me/drive/root:/${name}:/content`;
    
    if (folderId && folderId !== 'root') {
      url = `${this.apiBase}/me/drive/items/${folderId}:/${name}:/content`;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
      body: new Uint8Array(content),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to upload file: ${error}`);
    }

    const data = await response.json();

    return {
      id: data.id,
      name: data.name,
      mimeType: data.file?.mimeType || 'application/octet-stream',
      size: data.size,
      modifiedTime: data.lastModifiedDateTime,
    };
  }
}

/**
 * Factory function to create the appropriate cloud storage service
 */
export function createCloudStorageService(
  provider: CloudProvider,
  accessToken: string
): GoogleDriveService | DropboxService | OneDriveService {
  switch (provider) {
    case 'google_drive':
      return new GoogleDriveService(accessToken);
    case 'dropbox':
      return new DropboxService(accessToken);
    case 'onedrive':
      return new OneDriveService(accessToken);
    default:
      throw new Error(`Unsupported cloud provider: ${provider}`);
  }
}
