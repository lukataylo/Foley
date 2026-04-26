// E2E smoke for the onboarding wizard. The flow is judge-critical (it's
// the first real interaction every user has with Foley) and has regressed
// twice from architectural sweeps — this is the gate that catches the
// next regression before a screenshot does.
//
// What we cover:
//   1. /welcome renders with the headline + connect-repo CTA visible
//   2. /onboard auth pane lets us advance when keys are configured
//   3. step 2 paste-a-URL flow: typing a real GitHub URL surfaces the
//      resolved repo card with the right full_name
//   4. an obviously-bogus paste shows an inline error and disables Continue
//
// What we deliberately don't cover:
//   - the actual bootstrap → propose-steps → editor handoff (calls Claude,
//     burns credits; the smoke layer for that is API-level and runs on
//     fixture data)
//   - private repos / GITHUB_TOKEN paths (no fixture token in CI)

import { test, expect } from "@playwright/test";

test.describe("onboarding paste-a-URL flow", () => {
  test("welcome page renders headline + connect CTA", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.locator("h1.welcome-headline")).toContainText("Walkthroughs that");
    // The hero CTA varies by host (GitHub Pages landing strips it on the
    // public host). On localhost it should be present.
    const cta = page.getByRole("link", { name: /Connect.*GitHub repo/i }).first();
    await expect(cta).toBeVisible();
  });

  test("onboard step 2 resolves a real repo URL", async ({ page }) => {
    // Skip the auth pane: we've configured keys (the smoke runner asserts
    // /api/keys returns configured) so the Continue button on step 1 is
    // enabled. If keys aren't set this test is a no-op rather than a
    // false negative.
    await page.goto("/onboard");

    const keysAreSet = await page
      .request.get("/api/keys")
      .then((r) => r.json())
      .then((j) => {
        const s = j?.status ?? {};
        return (
          s.ANTHROPIC_API_KEY?.configured && s.ELEVENLABS_API_KEY?.configured
        );
      })
      .catch(() => false);
    test.skip(!keysAreSet, "Anthropic/ElevenLabs keys not configured locally");

    await page.getByRole("button", { name: /Continue/i }).first().click();
    await expect(page.getByRole("heading", { name: /Paste a GitHub repo/i })).toBeVisible();

    const urlInput = page.getByPlaceholder(/https:\/\/github\.com\//i);
    await expect(urlInput).toBeVisible();

    // Type a real public repo URL and wait for the debounce + API resolve
    // to complete. octocat/Hello-World is the GitHub canonical demo repo —
    // 14 years old, will not disappear.
    await urlInput.fill("https://github.com/octocat/Hello-World");
    await urlInput.blur();

    const resolvedCard = page.locator(".onboard-resolved-card");
    await expect(resolvedCard).toBeVisible({ timeout: 10_000 });
    await expect(resolvedCard).toContainText("octocat/Hello-World");
  });

  test("onboard step 2 rejects bogus URL", async ({ page }) => {
    await page.goto("/onboard");

    const keysAreSet = await page
      .request.get("/api/keys")
      .then((r) => r.json())
      .then((j) => {
        const s = j?.status ?? {};
        return (
          s.ANTHROPIC_API_KEY?.configured && s.ELEVENLABS_API_KEY?.configured
        );
      })
      .catch(() => false);
    test.skip(!keysAreSet, "Anthropic/ElevenLabs keys not configured locally");

    await page.getByRole("button", { name: /Continue/i }).first().click();
    const urlInput = page.getByPlaceholder(/https:\/\/github\.com\//i);
    await urlInput.fill("not-a-real-url");
    await urlInput.blur();

    // The error hint mentions "couldn't read" via /api/github/resolve.
    await expect(page.locator(".onboard-field-err").first()).toBeVisible({
      timeout: 5_000,
    });

    const continueBtn = page.getByRole("button", { name: /Continue.*Bootstrap/i });
    await expect(continueBtn).toBeDisabled();
  });
});
