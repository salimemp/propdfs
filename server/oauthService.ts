/**
 * OAuth Service for Cloud Storage Providers
 * Handles authorization URLs, token exchange, and token refresh
 */

import { ENV } from "./_core/env";

// OAuth configuration types
interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
}

interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
  scope?: string;
}

interface UserInfo {
  email?: string;
  name?: string;
  id?: string;
}

// Get the base URL for redirects
function getBaseUrl(): string {
  // In production, use the actual domain
  // For development, use the preview URL
  return process.env.APP_URL || "https://propdfs.manus.space";
}

// ==================== GOOGLE DRIVE OAUTH ====================

export class GoogleDriveOAuth {
  private config: OAuthConfig;

  constructor(clientId: string, clientSecret: string) {
    this.config = {
      clientId,
      clientSecret,
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
      redirectUri: `${getBaseUrl()}/api/oauth/callback/google`,
    };
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: this.config.scopes.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `${this.config.authorizationUrl}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google token exchange failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google token refresh failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: refreshToken, // Google doesn't return a new refresh token
      expiresIn: data.expires_in,
      tokenType: data.token_type,
    };
  }

  async getUserInfo(accessToken: string): Promise<UserInfo> {
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to get Google user info");
    }

    const data = await response.json();
    return {
      email: data.email,
      name: data.name,
      id: data.id,
    };
  }
}

// ==================== DROPBOX OAUTH ====================

export class DropboxOAuth {
  private config: OAuthConfig;

  constructor(clientId: string, clientSecret: string) {
    this.config = {
      clientId,
      clientSecret,
      authorizationUrl: "https://www.dropbox.com/oauth2/authorize",
      tokenUrl: "https://api.dropboxapi.com/oauth2/token",
      scopes: [
        "files.content.read",
        "files.content.write",
        "account_info.read",
      ],
      redirectUri: `${getBaseUrl()}/api/oauth/callback/dropbox`,
    };
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      token_access_type: "offline",
      state,
    });
    return `${this.config.authorizationUrl}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${this.config.clientId}:${this.config.clientSecret}`
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Dropbox token exchange failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in || 14400, // Dropbox tokens expire in 4 hours
      tokenType: data.token_type,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${this.config.clientId}:${this.config.clientSecret}`
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Dropbox token refresh failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: refreshToken,
      expiresIn: data.expires_in || 14400,
      tokenType: data.token_type,
    };
  }

  async getUserInfo(accessToken: string): Promise<UserInfo> {
    const response = await fetch(
      "https://api.dropboxapi.com/2/users/get_current_account",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to get Dropbox user info");
    }

    const data = await response.json();
    return {
      email: data.email,
      name: data.name?.display_name,
      id: data.account_id,
    };
  }
}

// ==================== ONEDRIVE (MICROSOFT) OAUTH ====================

export class OneDriveOAuth {
  private config: OAuthConfig;

  constructor(clientId: string, clientSecret: string) {
    this.config = {
      clientId,
      clientSecret,
      authorizationUrl:
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: [
        "Files.Read",
        "Files.ReadWrite",
        "User.Read",
        "offline_access",
      ],
      redirectUri: `${getBaseUrl()}/api/oauth/callback/onedrive`,
    };
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: this.config.scopes.join(" "),
      response_mode: "query",
      state,
    });
    return `${this.config.authorizationUrl}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OneDrive token exchange failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OneDrive token refresh failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
    };
  }

  async getUserInfo(accessToken: string): Promise<UserInfo> {
    const response = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to get OneDrive user info");
    }

    const data = await response.json();
    return {
      email: data.mail || data.userPrincipalName,
      name: data.displayName,
      id: data.id,
    };
  }
}

// ==================== BOX OAUTH ====================

export class BoxOAuth {
  private config: OAuthConfig;

  constructor(clientId: string, clientSecret: string) {
    this.config = {
      clientId,
      clientSecret,
      authorizationUrl: "https://account.box.com/api/oauth2/authorize",
      tokenUrl: "https://api.box.com/oauth2/token",
      scopes: [], // Box doesn't use scopes in the same way
      redirectUri: `${getBaseUrl()}/api/oauth/callback/box`,
    };
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      state,
    });
    return `${this.config.authorizationUrl}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Box token exchange failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Box token refresh failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
    };
  }

  async getUserInfo(accessToken: string): Promise<UserInfo> {
    const response = await fetch("https://api.box.com/2.0/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to get Box user info");
    }

    const data = await response.json();
    return {
      email: data.login,
      name: data.name,
      id: data.id,
    };
  }
}

// ==================== OAUTH FACTORY ====================

export type CloudProvider = "google_drive" | "dropbox" | "onedrive" | "box";

export function createOAuthService(
  provider: CloudProvider,
  clientId: string,
  clientSecret: string
) {
  switch (provider) {
    case "google_drive":
      return new GoogleDriveOAuth(clientId, clientSecret);
    case "dropbox":
      return new DropboxOAuth(clientId, clientSecret);
    case "onedrive":
      return new OneDriveOAuth(clientId, clientSecret);
    case "box":
      return new BoxOAuth(clientId, clientSecret);
    default:
      throw new Error(`Unsupported OAuth provider: ${provider}`);
  }
}

// ==================== STATE MANAGEMENT ====================

// Simple in-memory state store for OAuth flow
// In production, use Redis or database
const oauthStates = new Map<string, { userId: number; provider: CloudProvider; expiresAt: number }>();

export function generateOAuthState(userId: number, provider: CloudProvider): string {
  const state = crypto.randomUUID();
  oauthStates.set(state, {
    userId,
    provider,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  });
  return state;
}

export function validateOAuthState(state: string): { userId: number; provider: CloudProvider } | null {
  const data = oauthStates.get(state);
  if (!data) return null;
  
  if (Date.now() > data.expiresAt) {
    oauthStates.delete(state);
    return null;
  }
  
  oauthStates.delete(state);
  return { userId: data.userId, provider: data.provider };
}

// Clean up expired states periodically
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(oauthStates.entries());
  for (const [state, data] of entries) {
    if (now > data.expiresAt) {
      oauthStates.delete(state);
    }
  }
}, 60 * 1000); // Every minute
