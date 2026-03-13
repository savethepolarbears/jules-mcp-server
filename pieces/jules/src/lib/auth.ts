/**
 * Authentication definition for Google Jules API.
 * Uses API Key authentication via X-Goog-Api-Key header.
 * Generate your key at https://jules.google/settings
 */

import { PieceAuth, Property } from '@activepieces/pieces-framework';

export const julesAuth = PieceAuth.CustomAuth({
  description: `
    Authenticate with the Google Jules API using your API key.
    Generate a key at [jules.google/settings](https://jules.google/settings).
  `,
  required: true,
  props: {
    apiKey: PieceAuth.SecretText({
      displayName: 'Jules API Key',
      description: 'Your Google Jules API key (X-Goog-Api-Key)',
      required: true,
    }),
    defaultRepo: Property.ShortText({
      displayName: 'Default Repository',
      description:
        'Default GitHub repository in owner/repo format (e.g., savethepolarbears/jules-mcp-server)',
      required: false,
    }),
  },
});

export type JulesAuthValue = {
  apiKey: string;
  defaultRepo?: string;
};
