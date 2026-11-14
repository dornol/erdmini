import type { CollabOperation } from '../../src/lib/types/collab';
import type { Page } from 'playwright/test';

/** Delay only outbound operations; real joins, presence and server traffic remain live. */
export async function holdCollaborationOperations(page: Page) {
  const operations: Array<{ op: CollabOperation }> = [];
  const receivedOperations: Array<{ op: CollabOperation }> = [];
  const pending: Array<() => void> = [];
  let holding = true;
  await page.routeWebSocket('**/collab', route => {
    const upstream = route.connectToServer();
    upstream.onMessage(message => {
      const parsed = JSON.parse(String(message));
      if (parsed.type === 'operation') receivedOperations.push(parsed);
      route.send(message);
    });
    route.onMessage(message => {
      const parsed = JSON.parse(String(message));
      if (parsed.type === 'operation') {
        operations.push(parsed);
        if (holding) { pending.push(() => upstream.send(message)); return; }
      }
      upstream.send(message);
    });
  });
  return {
    operations,
    receivedOperations,
    release() {
      holding = false;
      for (const send of pending.splice(0)) send();
    },
  };
}
