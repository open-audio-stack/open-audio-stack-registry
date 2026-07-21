import { execSync } from 'child_process';

// GitHub Actions always provides GITHUB_TOKEN automatically to workflow steps, so scripts that
// call the REST/GraphQL API directly (rather than shelling out to the gh CLI) work there with no
// extra setup and no dependency on any CLI binary being installed on the runner. The `gh auth
// token` fallback below exists purely for local development convenience - a contributor who has
// already run `gh auth login` but hasn't exported a token env var.
export function getGithubToken(): string {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    return execSync('gh auth token', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}
