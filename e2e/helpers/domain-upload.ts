import type { Page } from 'playwright/test';

export async function delayDomainRead(page: Page) {
  await page.evaluate(() => {
    const originalRead = File.prototype.arrayBuffer;
    const state = window as typeof window & { releaseDomainRead?: () => void; domainReadStarted?: boolean; domainReadFinished?: boolean };
    const gate = new Promise<void>(resolve => { state.releaseDomainRead = resolve; });
    File.prototype.arrayBuffer = async function () {
      if (this.name !== 'delayed-domains.xlsx') return originalRead.call(this);
      state.domainReadStarted = true;
      await gate;
      const result = await originalRead.call(this);
      state.domainReadFinished = true;
      return result;
    };
  });
}
