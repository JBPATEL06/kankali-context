import { Octokit } from '@octokit/rest';

/**
 * Isolated GitHub Adapter for Context Storage
 * Uses the @octokit/rest API to persist and retrieve session data in a GitHub repository.
 */
export class GitHubAdapter {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private branch: string;

  /**
   * Initializes the adapter with a GitHub Personal Access Token (PAT).
   */
  constructor(token: string, owner: string, repo: string, branch: string = 'main') {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
  }

  /**
   * Commits the session payload to a specified file path in the GitHub repository.
   * 
   * @param session_id Unique identifier for the session
   * @param payload The dictionary/object containing context data
   * @param commitMessage The commit message
   * @param filePath The file path in the repository (defaults to .context/${session_id}.json)
   * @returns The commit SHA
   */
  async sync_context_to_repo(
    session_id: string,
    payload: Record<string, any>,
    commitMessage: string,
    filePath: string = `.context/${session_id}.json`
  ): Promise<string> {
    try {
      // 1. Check if the file already exists to get its SHA
      let fileSha: string | undefined = undefined;
      
      try {
        const { data } = await this.octokit.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: filePath,
          ref: this.branch,
        });

        if (!Array.isArray(data) && data.type === 'file') {
          fileSha = data.sha;
        }
      } catch (error: any) {
        // If file doesn't exist, GitHub API throws a 404 error
        if (error.status !== 404) {
          throw error;
        }
      }

      // 2. Pretty-print and Base64 encode the payload
      const contentStr = JSON.stringify(payload, null, 2);
      
      // Isomorphic base64 encoding (works in Node.js and Browser)
      const contentEncoded = typeof Buffer !== 'undefined' 
        ? Buffer.from(contentStr, 'utf-8').toString('base64') 
        : btoa(unescape(encodeURIComponent(contentStr)));

      // 3. Create or update file contents
      const response = await this.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path: filePath,
        message: commitMessage,
        content: contentEncoded,
        sha: fileSha,
        branch: this.branch,
      });

      return response.data.commit.sha as string;
    } catch (error) {
      console.error(`Failed to sync session ${session_id} to GitHub repo ${this.owner}/${this.repo}:`, error);
      throw error;
    }
  }
}
