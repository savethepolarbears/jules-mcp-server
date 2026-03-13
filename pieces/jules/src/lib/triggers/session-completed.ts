/**
 * Polling trigger: Session Completed.
 * Polls Jules API for recently completed sessions and fires for each new one.
 * Uses time-based deduplication via the session's updateTime.
 */

import {
  createTrigger,
  TriggerStrategy,
  Property,
} from '@activepieces/pieces-framework';
import { julesAuth, type JulesAuthValue } from '../auth';
import { listSessions, type Session } from '../api';

/**
 * Polling trigger definition for terminal session states.
 * 
 * Monitors Jules sessions and fires whenever a session reaches a target state 
 * (COMPLETED, FAILED, or CANCELED) after the last polling cycle.
 */
export const sessionCompletedTrigger = createTrigger({
  auth: julesAuth,
  name: 'session_completed',
  displayName: 'Session Completed',
  description:
    'Triggers when a Jules coding session finishes (completed, failed, or canceled).',
  type: TriggerStrategy.POLLING,
  props: {
    includeStates: Property.StaticMultiSelectDropdown({
      displayName: 'Include States',
      description: 'Which terminal states should trigger the flow?',
      required: false,
      options: {
        options: [
          { label: 'Completed', value: 'COMPLETED' },
          { label: 'Failed', value: 'FAILED' },
          { label: 'Canceled', value: 'CANCELED' },
        ],
      },
    }),
  },
  sampleData: {
    name: 'sessions/123456789',
    id: '123456789',
    title: 'Fix login bug',
    prompt: 'Fix the login page authentication flow',
    state: 'COMPLETED',
    outputs: [
      {
        pullRequest: {
          url: 'https://github.com/example/repo/pull/42',
          title: 'Fix login bug',
          description: 'Fixed the authentication flow on the login page.',
        },
      },
    ],
  },
  /**
   * Initializes the trigger watermark on enablement.
   * 
   * @param context - Trigger enablement context.
   * @returns {Promise<void>} No return value.
   */
  async onEnable(context) {
    // Store the current time as our polling watermark
    await context.store.put('lastPollTime', new Date().toISOString());
  },
  /**
   * Performs cleanup on disablement.
   * 
   * @param _context - Trigger disablement context.
   * @returns {Promise<void>} No return value.
   */
  async onDisable(_context) {
    // No cleanup needed for polling
  },
  /**
   * Runs the polling logic to find new completed sessions.
   * 
   * @param context - Trigger execution context.
   * @returns {Promise<Array>} List of new terminal-state sessions.
   */
  async run(context) {
    const typedAuth = context.auth as JulesAuthValue;
    const lastPollTime =
      ((await context.store.get('lastPollTime')) as string | null) ??
      new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const targetStates = (context.propsValue.includeStates as string[]) ?? [
      'COMPLETED',
      'FAILED',
      'CANCELED',
    ];

    // Fetch recent sessions
    const { sessions } = await listSessions(typedAuth, 50);

    // Filter to terminal-state sessions updated after our watermark
    const newSessions = sessions.filter((s: Session) => {
      const isTerminal = targetStates.includes(s.state ?? '');
      const isNew =
        s.updateTime && new Date(s.updateTime) > new Date(lastPollTime);
      return isTerminal && isNew;
    });

    // Update the watermark
    await context.store.put('lastPollTime', new Date().toISOString());

    // Return new sessions as trigger items
    return newSessions.map((session: Session) => ({
      ...session,
      pullRequestUrl: session.outputs?.[0]?.pullRequest?.url ?? null,
    }));
  },
  /**
   * Tests the trigger with real data from the API.
   * 
   * @param context - Trigger test context.
   * @returns {Promise<Array>} Sample of terminal sessions.
   */
  async test(context) {
    const typedAuth = context.auth as JulesAuthValue;
    const { sessions } = await listSessions(typedAuth, 5);

    const terminalSessions = sessions.filter((s: Session) =>
      ['COMPLETED', 'FAILED', 'CANCELED'].includes(s.state ?? '')
    );

    return terminalSessions.slice(0, 3).map((session: Session) => ({
      ...session,
      pullRequestUrl: session.outputs?.[0]?.pullRequest?.url ?? null,
    }));
  },
});
