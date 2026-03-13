/**
 * Action: Get session status.
 * Poll or check the current state of a Jules coding session.
 */

import { createAction, Property } from '@activepieces/pieces-framework';
import { julesAuth, type JulesAuthValue } from '../auth';
import { getSession } from '../api';

/**
 * Action definition for retrieving Jules session status.
 * 
 * Takes a sessionId and returns the full session details along with 
 * convenience boolean flags for completion and failure states.
 */
export const getSessionAction = createAction({
  auth: julesAuth,
  name: 'get_session',
  displayName: 'Get Session Status',
  description:
    'Retrieve the current status of a Jules coding session, including PR output.',
  props: {
    sessionId: Property.ShortText({
      displayName: 'Session ID',
      description: 'The Jules session ID to check.',
      required: true,
    }),
  },
  /**
   * Executes the action to get session status.
   * 
   * @param context - The context containing auth and property values.
   * @returns {Promise<Object>} Augmented session object with status flags and PR URL.
   */
  async run({ auth, propsValue }) {
    const typedAuth = auth as JulesAuthValue;
    const session = await getSession(typedAuth, propsValue.sessionId);

    return {
      ...session,
      isComplete: session.state === 'COMPLETED',
      isFailed: session.state === 'FAILED',
      isWaitingApproval: session.state === 'AWAITING_PLAN_APPROVAL',
      pullRequestUrl: session.outputs?.[0]?.pullRequest?.url ?? null,
    };
  },
});
