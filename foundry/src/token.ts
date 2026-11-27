// The Entra token for agent management (audience https://ai.azure.com) from the Azure CLI: in
// GitHub Actions the OIDC login of azure/login, locally the developer's `az login`. Never printed.
import { execFileSync } from 'node:child_process';

class NoLoginError extends Error {
  constructor() {
    super('no Azure login');
    this.name = 'CredentialUnavailableError';
  }
}

/** `subscription`: locally, the Foundry resource's subscription when `az` holds several accounts. */
export function azureCliToken(subscription?: string): string {
  const args = ['account', 'get-access-token', '--resource', 'https://ai.azure.com'];
  if (subscription) args.push('--subscription', subscription);
  args.push('--query', 'accessToken', '-o', 'tsv');
  try {
    const token = execFileSync('az', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 60_000,
    }).trim();
    if (!token) throw new NoLoginError();
    return token;
  } catch {
    throw new NoLoginError();
  }
}
