import { expect, Page } from "@playwright/test";

const approveButtonPatterns = [
  /授权|同意|允许|确认|继续/i,
  /authorize|accept|allow|approve|continue/i,
];

const successPatterns = [
  /授权成功|已授权|操作成功/i,
  /authorized|success|completed|complete|authorization complete|you can close this page/i,
];

export class AuthPage {
  constructor(private readonly page: Page) {}

  async open(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
  }

  async completeAuth(): Promise<void> {
    await this.failFastWhenLoginRequired();
    await this.waitForScopePageReady();
    if (await this.hasSuccessSignal(1_500)) {
      return;
    }
    try {
      await this.tryClickApprovalButtons();
    } catch (error) {
      if (await this.hasSuccessSignal(3_000)) {
        return;
      }
      throw error;
    }
    await this.waitForSuccessSignal();
  }

  private async failFastWhenLoginRequired(): Promise<void> {
    if (this.page.url().includes("accounts.feishu.cn")) {
      throw new Error(
        "login_required: redirected to Feishu account login. Provide FEISHU_SESSION or LARK_SESSION_* so the script can inject an authenticated session."
      );
    }
    const qrLogin = this.page.getByText(/Log In With QR Code|扫码登录/i).first();
    if (await qrLogin.isVisible({ timeout: 5_000 }).catch(() => false)) {
      throw new Error(
        "login_required: browser reached Feishu login page. Provide FEISHU_SESSION or LARK_SESSION_* so the script can inject an authenticated session."
      );
    }
  }

  private async tryClickApprovalButtons(): Promise<void> {
    const checkboxPatterns = [/同意|协议|条款|已阅读|agree|terms|policy/i];
    const roots = [this.page, ...this.page.frames()];

    for (const root of roots) {
      for (const pattern of checkboxPatterns) {
        const checkbox = root.getByRole("checkbox", { name: pattern }).first();
        if (await checkbox.isVisible({ timeout: 800 }).catch(() => false)) {
          await checkbox.click({ timeout: 5_000 }).catch(() => undefined);
        }
        const textNode = root.getByText(pattern).first();
        if (await textNode.isVisible({ timeout: 500 }).catch(() => false)) {
          await textNode.click({ timeout: 5_000 }).catch(() => undefined);
        }
      }
    }

    for (const root of roots) {
      for (const pattern of approveButtonPatterns) {
        const locator = root.getByRole("button", { name: pattern }).first();
        if (await locator.isVisible({ timeout: 2_500 }).catch(() => false)) {
          await locator.click({ timeout: 15_000 });
          return;
        }

        const textNode = root.getByText(pattern).first();
        if (await textNode.isVisible({ timeout: 1_200 }).catch(() => false)) {
          await textNode.click({ timeout: 10_000 }).catch(() => undefined);
          return;
        }
      }
    }

    const fallback = this.page.locator("button, [role='button']").first();
    if (await fallback.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await fallback.click({ timeout: 10_000 }).catch(() => undefined);
      return;
    }

    throw new Error("authorize button not found");
  }

  private async waitForSuccessSignal(): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < 60_000) {
      if (await this.hasSuccessSignal(400)) {
        return;
      }
      await this.page.waitForTimeout(500);
    }

    throw new Error("no success text detected");
  }

  private async hasSuccessSignal(textTimeoutMs: number): Promise<boolean> {
    const url = this.page.url();
    if (/success|authorized|complete|done|result/i.test(url)) {
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

  private async waitForScopePageReady(): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < 45_000) {
      const preview = await this.bodyPreview();
      const bodyTextLength = await this.page
        .evaluate(() => (document.body && document.body.innerText ? document.body.innerText.length : 0))
        .catch(() => 0);
      if (!preview.toLowerCase().includes("one moment, loading") && bodyTextLength > 30) {
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
