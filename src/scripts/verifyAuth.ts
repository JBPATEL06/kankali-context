import { Octokit } from '@octokit/rest';
import { google } from 'googleapis';

async function verifyGitHub(token: string): Promise<boolean> {
  try {
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.rest.users.getAuthenticated();
    console.log(`[SUCCESS] GitHub PAT is valid (Authenticated as: ${data.login})`);
    return true;
  } catch (error: any) {
    console.error(`[ERROR] Invalid GitHub PAT: ${error.message}`);
    return false;
  }
}

async function verifyGoogleDrive(token: string): Promise<boolean> {
  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: token });
    const drive = google.drive({ version: 'v3', auth });
    
    // Lightweight query against appDataFolder
    await drive.files.list({
      spaces: 'appDataFolder',
      pageSize: 1,
      fields: 'files(id)'
    });
    
    console.log(`[SUCCESS] Google Drive OAuth token is valid and appDataFolder is accessible`);
    return true;
  } catch (error: any) {
    console.error(`[ERROR] Invalid/Expired Google Drive token: ${error.message}`);
    return false;
  }
}

async function main() {
  const githubPat = process.env.GITHUB_PAT || process.argv[2];
  const driveToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN || process.argv[3];
  
  let success = true;
  
  console.log('--- Auth Diagnostic Checks ---');
  
  if (githubPat) {
    const githubValid = await verifyGitHub(githubPat);
    success = success && githubValid;
  } else {
    console.log('[SKIP] GitHub PAT not provided. Provide via GITHUB_PAT env or CLI arg 1.');
  }
  
  if (driveToken) {
    const driveValid = await verifyGoogleDrive(driveToken);
    success = success && driveValid;
  } else {
    console.log('[SKIP] Google Drive Token not provided. Provide via GOOGLE_DRIVE_ACCESS_TOKEN env or CLI arg 2.');
  }
  
  if (!githubPat && !driveToken) {
    console.log('[WARNING] No tokens provided to verify.');
    process.exit(1);
  }
  
  if (!success) {
    console.log('\n[RESULT] Verification Failed.');
    process.exit(1);
  } else {
    console.log('\n[RESULT] Verification Passed.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
