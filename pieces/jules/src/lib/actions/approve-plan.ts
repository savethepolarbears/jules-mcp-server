/**
 * Action: Approve a Jules session plan.
 * Approves the plan for sessions in AWAITING_PLAN_APPROVAL state.
 */

import { createAction, Property } from '@activepieces/pieces-framework';
import { julesAuth, type JulesAuthValue } from '../auth';
import { approvePlan } from '../api';

/**
 * Action definition for approving a session plan.
 * 
 * Takes a sessionId and transitions it from planning to execution.
 */
export const approvePlanAction = createAction({
  auth: julesAuth,
  name: 'approve_plan',
  displayName: 'Approve Session Plan',
  description:
    'Approve the plan for a Jules session that is waiting for plan approval.',
  props: {
    sessionId: Property.ShortText({
      displayName: 'Session ID',
      description: 'The Jules session ID to approve.',
      required: true,
    }),
  },
  /**
   * Executes the action to approve a session plan.
   * 
   * @param context - The context containing auth and property values.
   * @returns {Promise<import('../api').Session>} The updated session object.
   */
  async run({ auth, propsValue }) {
    const typedAuth = auth as JulesAuthValue;
    return approvePlan(typedAuth, propsValue.sessionId);
  },
});
