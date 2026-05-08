import { expect, Page } from "@playwright/test";

const successPatterns = [
  /app created|ready to go/i,
  /developer console|create custom app/i,
];

export class CliAppPage {
  constructor(private readonly page: Page) {}

  async open(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
  }

  async completeAuth(): Promise<void> {
    await this.waitForPageReady();
    if (await this.hasSuccessSignal(1_500)) {
      return;
    }
    await this.clickCreateOrUse();
    await this.waitForSuccessSignal();
  }

  private async clickCreateOrUse(): Promise<void> {
    for (const pattern of [/^Use$/i, /^Create$/i]) {
      const button = this.page.getByRole("button", { name: pattern }).first();
      if (await button.isVisible({ timeout: 1_500 }).catch(() => false)) {
        await button.click({ timeout: 15_000 });
        return;
      }
    }

    throw new Error("cli app action button not found");
  }

  private async waitForSuccessSignal(): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < 60_000) {
      if (await this.hasSuccessSignal(400)) {
        return;
      }
      await this.page.waitForTimeout(500);
    }

    throw new Error("no cli app success text detected");
  }

  private async hasSuccessSignal(textTimeoutMs: number): Promise<boolean> {
    const url = this.page.url();
    if (/open\.feishu\.cn\/app(?:[/?#]|$)/i.test(url)) {
      return true;
    }

    for (const pattern of successPatterns) {
      const locator = this.page.getByText(pattern).first();
      if (await locator.isVisible({ timeout: textTimeoutMs }).catch(() => false)) {
        await expect(locator).toBeVisible();
        return true;
      }
    }

    return false;
  }

  private async waitForPageReady(): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < 45_000) {
      const preview = await this.bodyPreview();
      const bodyTextLength = await this.page
        .evaluate(() => (document.body && document.body.innerText ? document.body.innerText.length : 0))
        .catch(() => 0);
      if (!preview.toLowerCase().includes("loading") && bodyTextLength > 30) {
        return;
      }
      await this.page.waitForTimeout(500);
    }
  }

  private async bodyPreview(): Promise<string> {
    return this.page
      .evaluate(() => (document.body && document.body.innerText ? document.body.innerText.slice(0, 200) : ""))
      .catch(() => "");
  }
}
