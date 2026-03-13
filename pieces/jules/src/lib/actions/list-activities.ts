/**
 * Action: List activities (event log) for a Jules session.
 */

import { createAction, Property } from '@activepieces/pieces-framework';
import { julesAuth, type JulesAuthValue } from '../auth';
import { listActivities } from '../api';

/**
 * Action definition for listing activities of a Jules session.
 * 
 * Provides an audit trail of events including plan generation and completion metadata.
 */
export const listActivitiesAction = createAction({
  auth: julesAuth,
  name: 'list_activities',
  displayName: 'List Session Activities',
  description:
    'List the activity log for a Jules session — plan generation, progress, messages, and completion events.',
  props: {
    sessionId: Property.ShortText({
      displayName: 'Session ID',
      description: 'The Jules session ID to list activities for.',
      required: true,
    }),
    pageSize: Property.Number({
      displayName: 'Page Size',
      description: 'Maximum number of activities to return.',
      required: false,
      defaultValue: 50,
    }),
  },
  /**
   * Executes the action to list activities.
   * 
   * @param context - The context containing auth and property values.
   * @returns {Promise<{ activities: import('../api').Activity[]; nextPageToken?: string }>} List of activities.
   */
  async run({ auth, propsValue }) {
    const typedAuth = auth as JulesAuthValue;
    return listActivities(
      typedAuth,
      propsValue.sessionId,
      propsValue.pageSize ?? 50
    );
  },
});
