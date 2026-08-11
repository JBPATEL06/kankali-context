import { google } from 'googleapis';

/**
 * Isolated Google Drive Adapter for appDataFolder
 * Uses the Google Drive v3 API to persist and retrieve session data in the hidden appDataFolder.
 */
export class DriveAdapter {
  private drive;

  /**
   * Initializes the adapter with a Google OAuth token.
   * Prefer access_token for short-lived sessions; pass isRefreshToken=true when using a refresh_token.
   * Requires scope: https://www.googleapis.com/auth/drive.appdata
   */
  constructor(token: string, options?: { isRefreshToken?: boolean }) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    const auth = new google.auth.OAuth2(clientId || undefined, clientSecret || undefined);

    if (options?.isRefreshToken) {
      if (!clientId || !clientSecret) {
        throw new Error(
          'Server configuration error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required when using a refresh_token.'
        );
      }
      auth.setCredentials({ refresh_token: token });
    } else {
      // Primary path: use the access token saved from Google Sign-In
      auth.setCredentials({ access_token: token });
    }

    this.drive = google.drive({ version: 'v3', auth });
  }

  /**
   * Saves or updates a session payload in the Google Drive appDataFolder.
   */
  async save_to_appdata(session_id: string, payload: Record<string, any>): Promise<string> {
    const fileName = `${session_id}.json`;
    const fileMetadata = {
      name: fileName,
      parents: ['appDataFolder']
    };
    
    const media = {
      mimeType: 'application/json',
      body: JSON.stringify(payload)
    };

    try {
      const existingFileId = await this.getFileId(fileName);

      if (existingFileId) {
        const res = await this.drive.files.update({
          fileId: existingFileId,
          requestBody: {},
          media: media,
          fields: 'id'
        });
        return res.data.id as string;
      } else {
        const res = await this.drive.files.create({
          requestBody: fileMetadata,
          media: media,
          fields: 'id'
        });
        return res.data.id as string;
      }
    } catch (error) {
      console.error(`Failed to save session ${session_id} to appDataFolder:`, error);
      throw error;
    }
  }

  /**
   * Reads a session payload from the Google Drive appDataFolder.
   */
  async read_from_appdata(session_id: string): Promise<Record<string, any> | null> {
    const fileName = `${session_id}.json`;
    try {
      const fileId = await this.getFileId(fileName);
      if (!fileId) {
        return null;
      }

      const res = await this.drive.files.get({
        fileId: fileId,
        alt: 'media'
      });

      return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    } catch (error) {
      console.error(`Failed to read session ${session_id} from appDataFolder:`, error);
      throw error;
    }
  }

  /**
   * Reads a file as raw text from the Google Drive appDataFolder.
   */
  async read_file_as_text(fileName: string): Promise<string | null> {
    try {
      const fileId = await this.getFileId(fileName);
      if (!fileId) return null;
      
      const res = await this.drive.files.get({ fileId: fileId, alt: 'media' });
      return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    } catch (error) {
      console.error(`Failed to read file ${fileName} as text from appDataFolder:`, error);
      throw error;
    }
  }

  /**
   * Writes raw text to a file in the Google Drive appDataFolder.
   */
  async write_file_as_text(fileName: string, content: string): Promise<string> {
    const fileMetadata = { name: fileName, parents: ['appDataFolder'] };
    const media = { mimeType: 'text/markdown', body: content };

    try {
      const existingFileId = await this.getFileId(fileName);
      if (existingFileId) {
        const res = await this.drive.files.update({
          fileId: existingFileId, requestBody: {}, media: media, fields: 'id'
        });
        return res.data.id as string;
      } else {
        const res = await this.drive.files.create({
          requestBody: fileMetadata, media: media, fields: 'id'
        });
        return res.data.id as string;
      }
    } catch (error) {
      console.error(`Failed to write file ${fileName} as text to appDataFolder:`, error);
      throw error;
    }
  }

  private async getFileId(fileName: string): Promise<string | null> {
    const res = await this.drive.files.list({
      spaces: 'appDataFolder',
      q: `name='${fileName}' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 1
    });

    const files = res.data.files;
    if (files && files.length > 0) {
      return files[0].id as string;
    }
    return null;
  }
}
