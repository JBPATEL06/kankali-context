// GitHub REST API Integration for pushing AI Context Hub files to GitHub repositories

export interface GithubRepoInfo {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

export async function verifyGithubToken(token: string): Promise<{ username: string; avatarUrl: string }> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    throw new Error('Invalid GitHub token or insufficient permissions.');
  }

  const data = await response.json();
  return {
    username: data.login,
    avatarUrl: data.avatar_url,
  };
}

export async function pushFileToGithub(
  repoInfo: GithubRepoInfo,
  path: string,
  content: string,
  commitMessage: string
): Promise<{ url: string }> {
  const { owner, repo, branch, token } = repoInfo;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  // Step 1: Check if file exists to get SHA for update
  let sha: string | undefined = undefined;
  try {
    const getRes = await fetch(`${apiUrl}?ref=${branch}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    if (getRes.ok) {
      const fileData = await getRes.json();
      sha = fileData.sha;
    }
  } catch (e) {
    // File doesn't exist yet, which is fine
  }

  // Encode content to Base64 (handle UTF-8 strings properly)
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  const base64Content = btoa(binary);

  // Step 2: Create or update file
  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({
      message: commitMessage,
      content: base64Content,
      branch: branch || 'main',
      ...(sha ? { sha } : {}),
    }),
  });

  if (!putRes.ok) {
    const errorData = await putRes.json();
    throw new Error(errorData.message || 'Failed to push file to GitHub repository.');
  }

  const result = await putRes.json();
  return {
    url: result.content?.html_url || `https://github.com/${owner}/${repo}/blob/${branch}/${path}`,
  };
}

export async function pushContextHubToGithub(
  repoInfo: GithubRepoInfo,
  memories: any[]
): Promise<{ pushedCount: number; repoUrl: string }> {
  // Push index JSON file
  const jsonContent = JSON.stringify(memories, null, 2);
  await pushFileToGithub(
    repoInfo,
    'context_memories.json',
    jsonContent,
    'Update AI Context Memories index'
  );

  // Push individual markdown files for each memory
  let pushedCount = 0;
  for (const mem of memories) {
    const fileName = `memories/${mem.category}/${mem.title.toLowerCase().replace(/[^a-z0-0]/g, '_')}.md`;
    const mdContent = `---
title: "${mem.title}"
category: "${mem.category}"
targetPlatforms: ${JSON.stringify(mem.targetPlatforms)}
tags: ${JSON.stringify(mem.tags)}
updatedAt: "${mem.updatedAt}"
---

# ${mem.title}

${mem.content}
`;
    await pushFileToGithub(
      repoInfo,
      fileName,
      mdContent,
      `Sync memory: ${mem.title}`
    );
    pushedCount++;
  }

  return {
    pushedCount,
    repoUrl: `https://github.com/${repoInfo.owner}/${repoInfo.repo}`,
  };
}

export interface GithubRepoFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
  html_url: string;
}

export async function fetchGithubRepoContents(
  owner: string,
  repo: string,
  token: string,
  path: string = '',
  branch: string = 'main'
): Promise<GithubRepoFile[]> {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  const response = await fetch(apiUrl, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to fetch repo contents (${response.status})`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((item: any) => ({
    name: item.name,
    path: item.path,
    sha: item.sha,
    size: item.size,
    type: item.type === 'dir' ? 'dir' : 'file',
    html_url: item.html_url,
  }));
}
