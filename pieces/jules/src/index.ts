/**
 * Google Jules — Activepieces Piece
 *
 * Integrates Google Jules (AI coding agent) into Activepieces automation flows.
 * Provides 5 actions and 1 polling trigger for full session lifecycle management.
 *
 * Actions:
 *   - create_session   — Dispatch a coding task to Jules
 *   - get_session      — Check session status and PR output
 *   - approve_plan     — Approve a pending plan
 *   - send_message     — Send feedback to an active session
 *   - list_activities  — View the session event log
 *
 * Triggers:
 *   - session_completed — Fires when a session reaches a terminal state
 */

import { createPiece } from '@activepieces/pieces-framework';
import { julesAuth } from './lib/auth';

// Actions
import { createSessionAction } from './lib/actions/create-session';
import { getSessionAction } from './lib/actions/get-session';
import { approvePlanAction } from './lib/actions/approve-plan';
import { sendMessageAction } from './lib/actions/send-message';
import { listActivitiesAction } from './lib/actions/list-activities';

// Triggers
import { sessionCompletedTrigger } from './lib/triggers/session-completed';

export const jules = createPiece({
  displayName: 'Google Jules',
  description:
    'Google Jules is an AI coding agent that autonomously fixes bugs, writes features, and creates pull requests in your GitHub repositories.',
  auth: julesAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://jules.google/favicon.ico',
  actions: [
    createSessionAction,
    getSessionAction,
    approvePlanAction,
    sendMessageAction,
    listActivitiesAction,
  ],
  triggers: [sessionCompletedTrigger],
  authors: ['savethepolarbears'],
});
