/**
 * Action: Send a message / feedback to an active Jules session.
 */

import { createAction, Property } from '@activepieces/pieces-framework';
import { julesAuth, type JulesAuthValue } from '../auth';
import { sendMessage } from '../api';

/**
 * Action definition for sending a message to an active Jules session.
 * 
 * Allows users to provide feedback or answer clarifying questions from the agent.
 */
export const sendMessageAction = createAction({
  auth: julesAuth,
  name: 'send_message',
  displayName: 'Send Message to Session',
  description:
    'Send feedback or instructions to an active Jules coding session.',
  props: {
    sessionId: Property.ShortText({
      displayName: 'Session ID',
      description: 'The Jules session ID to send a message to.',
      required: true,
    }),
    message: Property.LongText({
      displayName: 'Message',
      description: 'The feedback or instruction to send to Jules.',
      required: true,
    }),
  },
  /**
   * Executes the action to send a message.
   * 
   * @param context - The context containing auth and property values.
   * @returns {Promise<import('../api').Session>} The updated session object.
   */
  async run({ auth, propsValue }) {
    const typedAuth = auth as JulesAuthValue;
    return sendMessage(typedAuth, propsValue.sessionId, propsValue.message);
  },
});
