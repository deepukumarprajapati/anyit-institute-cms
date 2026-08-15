/**
 * Notification provider interfaces (email/SMS).
 * Wire real providers (SES, Twilio, etc.) without changing call sites.
 */

export type NotificationPayload = {
  to: string;
  subject?: string;
  body: string;
  channel: 'email' | 'sms';
};

export interface NotificationProvider {
  send(payload: NotificationPayload): Promise<{ ok: boolean; id?: string }>;
}

export class ConsoleNotificationProvider implements NotificationProvider {
  async send(payload: NotificationPayload) {
    console.log('[notify]', payload.channel, payload.to, payload.subject ?? '', payload.body);
    return { ok: true, id: `console-${Date.now()}` };
  }
}

let provider: NotificationProvider = new ConsoleNotificationProvider();

export function setNotificationProvider(next: NotificationProvider) {
  provider = next;
}

export function notify(payload: NotificationPayload) {
  return provider.send(payload);
}
