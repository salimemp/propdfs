export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Cloud Storage OAuth Credentials
  oneDriveClientId: process.env.ONEDRIVE_CLIENT_ID ?? "",
  oneDriveClientSecret: process.env.ONEDRIVE_CLIENT_SECRET ?? "",
  googleDriveClientId: process.env.GOOGLE_DRIVE_CLIENT_ID ?? "",
  googleDriveClientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "",
  dropboxAppKey: process.env.DROPBOX_APP_KEY ?? "",
  dropboxAppSecret: process.env.DROPBOX_APP_SECRET ?? "",
  boxClientId: process.env.BOX_CLIENT_ID ?? "",
  boxClientSecret: process.env.BOX_CLIENT_SECRET ?? "",
};
