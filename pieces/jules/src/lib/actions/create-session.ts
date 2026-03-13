/**
 * Action: Create a new Jules coding session.
 * Dispatches a coding task to Jules for a GitHub repository.
 */

import { createAction, Property } from '@activepieces/pieces-framework';
import { julesAuth, type JulesAuthValue } from '../auth';
import { createSession } from '../api';

/**
 * Action definition for creating a new Jules coding session.
 * 
 * Takes repository, branch, prompt, and other settings to initiate a task.
 * Returns the created session object.
 */
export const createSessionAction = createAction({
  auth: julesAuth,
  name: 'create_session',
  displayName: 'Create Coding Session',
  description:
    'Create a new Jules coding session to fix bugs, write features, or improve code in a GitHub repository.',
  props: {
    repository: Property.ShortText({
      displayName: 'Repository',
      description:
        'GitHub repository in owner/repo format. Leave blank to use the default from auth.',
      required: false,
    }),
    branch: Property.ShortText({
      displayName: 'Branch',
      description: 'Branch to base changes on (default: main)',
      required: false,
      defaultValue: 'main',
    }),
    prompt: Property.LongText({
      displayName: 'Task Prompt',
      description: 'Describe the coding task for Jules to perform.',
      required: true,
    }),
    title: Property.ShortText({
      displayName: 'Session Title',
      description: 'A short title for this session.',
      required: false,
    }),
    autoCreatePR: Property.Checkbox({
      displayName: 'Auto-Create Pull Request',
      description: 'Automatically create a PR when Jules finishes.',
      required: false,
      defaultValue: true,
    }),
    requirePlanApproval: Property.Checkbox({
      displayName: 'Require Plan Approval',
      description: 'Pause for human review before Jules starts coding.',
      required: false,
      defaultValue: false,
    }),
  },
  /**
   * Executes the action to create a Jules session.
   * 
   * @param context - The context containing auth and property values.
   * @returns {Promise<import('../api').Session>} The created session.
   * @throws {Error} If the repository is not provided.
   */
  async run({ auth, propsValue }) {
    const typedAuth = auth as JulesAuthValue;
    const repo = propsValue.repository || typedAuth.defaultRepo;
    if (!repo) {
      throw new Error(
        'Repository is required. Set it here or in the auth default.'
      );
    }

    const session = await createSession(typedAuth, {
      prompt: propsValue.prompt,
      sourceContext: {
        source: `sources/github/${repo}`,
        githubRepoContext: {
          startingBranch: propsValue.branch || 'main',
        },
      },
      title: propsValue.title || propsValue.prompt.substring(0, 100),
      automationMode: propsValue.autoCreatePR
        ? 'AUTO_CREATE_PR'
        : 'AUTOMATION_MODE_UNSPECIFIED',
      requirePlanApproval: propsValue.requirePlanApproval ?? false,
    });

    return session;
  },
});
