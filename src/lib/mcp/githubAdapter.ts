import { Octokit } from '@octokit/rest';
import { McpFileItem, McpFolderItem } from './types';

/**
 * Isolated GitHub Adapter for Book-Style Context Storage.
 * Uses @octokit/rest to manipulate hierarchical files and directories on GitHub.
 */
export class GitHubAdapter {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private branch: string;

  constructor(token: string, owner: string, repo: string, branch: string = 'main') {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
  }

  /**
   * Commits and writes/updates a file in the GitHub repository.
   */
  async write_file(
    filePath: string,
    content: string,
    commitMessage: string
  ): Promise<McpFileItem> {
    const cleanPath = filePath.trim().replace(/^\/+/g, '');
    const fileName = cleanPath.split('/').pop() || cleanPath;

    try {
      // 1. Check if the file already exists to get its SHA
      let fileSha: string | undefined = undefined;

      try {
        const { data } = await this.octokit.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: cleanPath,
          ref: this.branch,
        });

        if (!Array.isArray(data) && data.type === 'file') {
          fileSha = data.sha;
        }
      } catch (error: any) {
        if (error.status !== 404) {
          throw error;
        }
      }

      // 2. Encode content to Base64
      const contentEncoded = typeof Buffer !== 'undefined'
        ? Buffer.from(content, 'utf8').toString('base64')
        : btoa(unescape(encodeURIComponent(content)));

      // 3. Create or update file
      const response = await this.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path: cleanPath,
        message: commitMessage,
        content: contentEncoded,
        sha: fileSha,
        branch: this.branch,
      });

      return {
        id: response.data.content?.sha || response.data.commit.sha,
        name: fileName,
        path: `/${cleanPath}`,
        sha: response.data.commit.sha,
        size: Buffer.byteLength(content, 'utf8'),
        content,
        modifiedTime: new Date().toISOString(),
        webViewLink: response.data.content?.html_url || undefined,
      };
    } catch (error: any) {
      console.error(`Failed to write file /${cleanPath} to GitHub ${this.owner}/${this.repo}:`, error);
      throw error;
    }
  }

  /**
   * Reads a file from the GitHub repository.
   */
  async read_file(filePath: string): Promise<{ content: string; file: McpFileItem }> {
    const cleanPath = filePath.trim().replace(/^\/+/g, '');
    const fileName = cleanPath.split('/').pop() || cleanPath;

    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: cleanPath,
        ref: this.branch,
      });

      if (Array.isArray(data) || data.type !== 'file' || !data.content) {
        throw new Error(`Path /${cleanPath} is not a valid file in ${this.owner}/${this.repo}`);
      }

      const content = typeof Buffer !== 'undefined'
        ? Buffer.from(data.content, 'base64').toString('utf8')
        : decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))));

      return {
        content,
        file: {
          id: data.sha,
          name: fileName,
          path: `/${cleanPath}`,
          sha: data.sha,
          size: data.size,
          modifiedTime: new Date().toISOString(),
          webViewLink: data.html_url || undefined,
        },
      };
    } catch (error: any) {
      console.error(`Failed to read file /${cleanPath} from GitHub:`, error);
      throw error;
    }
  }

  /**
   * Lists contents of a directory on GitHub.
   */
  async list_folder(folderPath: string = ''): Promise<{ folders: McpFolderItem[]; files: McpFileItem[] }> {
    const cleanPath = folderPath.trim().replace(/^\/+|\/+$/g, '');
    const prefix = cleanPath ? `/${cleanPath}` : '';

    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: cleanPath,
        ref: this.branch,
      });

      if (!Array.isArray(data)) {
        throw new Error(`Path /${cleanPath} is a file, not a directory.`);
      }

      const folders: McpFolderItem[] = [];
      const files: McpFileItem[] = [];

      for (const item of data) {
        if (item.type === 'dir') {
          folders.push({
            id: item.sha,
            name: item.name,
            path: `${prefix}/${item.name}`,
          });
        } else if (item.type === 'file') {
          files.push({
            id: item.sha,
            name: item.name,
            path: `${prefix}/${item.name}`,
            sha: item.sha,
            size: item.size,
            webViewLink: item.html_url || undefined,
          });
        }
      }

      return { folders, files };
    } catch (error: any) {
      if (error.status === 404) {
        return { folders: [], files: [] };
      }
      console.error(`Failed to list directory /${cleanPath} on GitHub:`, error);
      throw error;
    }
  }

  /**
   * Deletes a file from the GitHub repository.
   */
  async delete_file(filePath: string, commitMessage: string): Promise<{ success: boolean; sha: string }> {
    const cleanPath = filePath.trim().replace(/^\/+/g, '');

    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: cleanPath,
        ref: this.branch,
      });

      if (Array.isArray(data) || data.type !== 'file') {
        throw new Error(`Cannot delete: /${cleanPath} is not a file.`);
      }

      const response = await this.octokit.repos.deleteFile({
        owner: this.owner,
        repo: this.repo,
        path: cleanPath,
        message: commitMessage,
        sha: data.sha,
        branch: this.branch,
      });

      return {
        success: true,
        sha: response.data.commit.sha as string,
      };
    } catch (error: any) {
      console.error(`Failed to delete file /${cleanPath} on GitHub:`, error);
      throw error;
    }
  }

  /**
   * Backward-compatible helper to sync JSON session context.
   */
  async sync_context_to_repo(
    session_id: string,
    payload: Record<string, any>,
    commitMessage: string,
    filePath: string = `.context/${session_id}.json`
  ): Promise<string> {
    const fileItem = await this.write_file(filePath, JSON.stringify(payload, null, 2), commitMessage);
    return fileItem.sha || 'synced';
  }
}
