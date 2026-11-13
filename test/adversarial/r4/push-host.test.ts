// @vitest-environment node
/** Adversarial r4: isPushServiceHost / validSubscription allow-list. A FAILING test = a defect. */
import { describe, it, expect } from 'vitest';
import { validSubscription, isPushServiceHost } from '@/lib/server/push';

const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
const ok = (endpoint: string) => validSubscription({ endpoint, keys });

describe('push service allow-list', () => {
  it('holds: real endpoints from Safari/macOS/iOS, Chrome/Android (FCM), Firefox, Edge (WNS)', () => {
    for (const e of [
      'https://web.push.apple.com/QGuQyavXutnMH2uPzIvbuR3hEb8a8nhBwP-fXJ4K9C1b',
      'https://fcm.googleapis.com/fcm/send/dpH5lCsTSSM:APA91bHqjZxM0VImWWqDRN7U0a3AycjUf4O',
      'https://fcm.googleapis.com/wp/dpH5lCsTSSM:APA91bHqjZxM0VImWWqDRN7U0a3AycjUf4O',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABhZ0aGo1K8gJnJYQ6L9d2pfIvbz9z3',
      'https://wns2-par02p.notify.windows.com/w/?token=BQYAAACl%2bAbC',
      'https://db5p.notify.windows.com/w/?token=BQYAAAB',
      'https://WEB.PUSH.APPLE.COM./x',
      'https://web.push.apple.com:443/x',
    ]) expect(ok(e), e).toBe(true);
  });

  it('holds: spoofs are refused (path, userinfo, suffix tricks, ports, http, IDN look-alikes)', () => {
    for (const e of [
      'https://evil.com/push.apple.com',
      'https://push.apple.com@evil.com/x',
      'https://web.push.apple.com.evil.com/x',
      'https://evilpush.apple.com/x',
      'https://evil.com#.push.apple.com',
      'https://evil.com\\@web.push.apple.com/x',
      'https://evil.com?.push.apple.com',
      'https://web.push.apple.com:8443/x',
      'http://web.push.apple.com/x',
      'https://web.push.аpple.com/x', // Cyrillic а → xn--
      'https://fcm.googleapis.com%2e.evil.com/x',
      'https://notify.windows.com.evil.com/x',
    ]) expect(ok(e), e).toBe(false);
    expect(isPushServiceHost('xn--pple-43d.com')).toBe(false);
  });
});
