import { test, expect } from "@playwright/test";

test("owner signs in, generates, edits and reopens a persistent isolated page", async ({
  page,
  context,
}) => {
  await page.goto("/website-builder");
  await page
    .getByLabel("Email", { exact: true })
    .fill("builder@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.getByRole("button", { name: "Sign in to Kora" }).click();
  await expect(
    page.getByRole("heading", { name: "Your websites" }),
  ).toBeVisible();
  const sidebar = page.getByRole("complementary", { name: "Website sidebar" });
  await expect(
    sidebar.getByRole("button", { name: "All websites", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await expect(sidebar).toHaveClass(/is-collapsed/);
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  await expect(sidebar).not.toHaveClass(/is-collapsed/);
  await page.screenshot({
    path: "test-results/website-hub-sidebar.png",
    fullPage: true,
  });
  const cookie = (await context.cookies()).find(
    (item) => item.name === "kora-builder-session",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "kora-builder-session",
  );
  await page.getByLabel("Website name").fill("Test Studio Website");
  await page
    .getByRole("button", { name: "Create website", exact: true })
    .click();
  await expect(page.getByLabel("AI model", { exact: true })).toHaveValue(
    "gpt-4.1",
  );
  await page
    .getByLabel("Describe your page")
    .fill("A welcoming website for our studio");
  let resumeGeneration = () => {};
  const generationGate = new Promise<void>((resolve) => {
    resumeGeneration = resolve;
  });
  await page.route("**/api/kora/websites/*/generate", async (route) => {
    await generationGate;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Generate page", exact: true })
    .click();
  try {
    await expect(sidebar.getByRole("navigation")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(
      sidebar.getByRole("button", { name: "Pages", exact: true }),
    ).toBeEnabled();
    await sidebar.getByRole("button", { name: "Pages", exact: true }).click();
    await expect(
      sidebar.getByRole("button", { name: "Website editor", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("status")).toContainText(
      "Your section will stay selected",
    );
  } finally {
    resumeGeneration();
  }
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("heading", { name: "Welcome to Test Studio" }),
  ).toBeVisible();
  expect(await page.locator("iframe").getAttribute("sandbox")).toBe(
    "allow-scripts",
  );
  expect(await page.evaluate(() => "compromised" in window)).toBe(false);
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await page
    .getByRole("textbox", { name: "HTML", exact: true })
    .fill("<main><h1>Edited and saved</h1></main>");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Changes saved.");
  await sidebar.getByRole("button", { name: "Pages", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pages", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open in Creative Editor", exact: true })
    .click();
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("heading", { name: "Edited and saved" }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: /Test Studio Website.*Open website/ })
    .click();
  await page
    .getByRole("button", { name: "Open in Creative Editor", exact: true })
    .click();
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("heading", { name: "Edited and saved" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open website navigation" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/website-builder-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/website-builder-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Build your next chapter." }),
  ).toBeVisible();
  expect(
    (await context.cookies()).some(
      (item) => item.name === "kora-builder-session",
    ),
  ).toBe(false);
});

test("API adapter rejects cross-origin writes and unknown proxy targets", async ({
  request,
}) => {
  const denied = await request.post("/api/kora/session", {
    headers: { origin: "https://foreign.example.invalid" },
    data: { email: "builder@example.invalid", password: "test-only-password" },
  });
  expect(denied.status()).toBe(403);
  const unknown = await request.get("/api/kora/admin/users");
  expect(unknown.status()).toBe(404);
  const unsigned = await request.get("/api/kora/websites");
  expect(unsigned.status()).toBe(401);
});

test("PDF-style hub supports page creation, settings, duplication, navigation and deletion", async ({
  page,
}) => {
  await page.goto("/website-builder");
  await page
    .getByLabel("Email", { exact: true })
    .fill("builder@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.getByRole("button", { name: "Sign in to Kora" }).click();
  await page
    .getByRole("button", { name: /Test Studio Website.*Open website/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Website", level: 2, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/pdf-website-overview.png",
    fullPage: true,
  });
  const sidebar = page.getByRole("complementary", { name: "Website sidebar" });
  await sidebar.getByRole("button", { name: "Pages", exact: true }).click();
  await page
    .getByRole("button", { name: "Create a page", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({
    path: "test-results/pdf-create-page.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Start manually/ }).click();
  await page.getByLabel("Page title", { exact: true }).fill("About studio");
  await page.getByLabel("Page slug", { exact: true }).fill("about-studio");
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("New draft page created.");
  await page
    .getByRole("button", { name: "Page settings", exact: true })
    .click();
  await page.getByLabel("Page title", { exact: true }).fill("About our studio");
  await page.getByLabel("SEO title", { exact: true }).fill("About Test Studio");
  await page
    .getByLabel("SEO description", { exact: true })
    .fill("Meet our studio team and learn about our work.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Page settings saved.");
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await page.getByLabel("Page title", { exact: true }).fill("Studio copy");
  await page.getByLabel("Page slug", { exact: true }).fill("studio-copy");
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Select Studio copy", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Navigation", exact: true }).click();
  await page
    .getByLabel("Menu label for About our studio", { exact: true })
    .fill("About us");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Navigation saved.");
  await page.screenshot({
    path: "test-results/pdf-navigation.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Pages", exact: true }).last().click();
  await page.getByRole("button", { name: "List view" }).click();
  await page.getByRole("button", { name: "Grid view" }).click();
  await page.getByLabel("Search pages").fill("about");
  await expect(
    page.getByRole("button", { name: "Select About our studio", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Select Home", exact: true }),
  ).not.toBeVisible();
  await page.getByLabel("Search pages").fill("");
  await page.screenshot({ path: "test-results/pdf-pages.png", fullPage: true });
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete draft page", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Select Studio copy", exact: true }),
  ).not.toBeVisible();
});

test("editor supports canvas changes, reviewable AI edits, version restore and an immutable public release", async ({
  page,
  context,
}) => {
  await page.goto("/website-builder");
  await page
    .getByLabel("Email", { exact: true })
    .fill("builder@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.getByRole("button", { name: "Sign in to Kora" }).click();
  await page
    .getByRole("button", { name: /Test Studio Website.*Open website/ })
    .click();
  await page
    .getByRole("button", { name: "Open in Creative Editor", exact: true })
    .click();
  page.on("console", (message) => {
    if (message.type() === "error")
      console.log("Canvas browser error:", message.text());
  });
  await page
    .getByRole("button", { name: "Select an element", exact: true })
    .click();
  await expect(page.frameLocator("iframe").locator("body")).toHaveAttribute(
    "data-kora-mode",
    "select",
  );
  await page
    .frameLocator("iframe")
    .getByRole("heading", { name: "Edited and saved" })
    .click();
  await page
    .getByRole("textbox", { name: "Text content", exact: true })
    .fill("Canvas edit saved");
  await page
    .getByRole("button", { name: "Apply manual changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("heading", { name: "Canvas edit saved" }),
  ).toBeVisible();
  await page
    .getByLabel("Ask Kora to change this page", { exact: true })
    .fill("Refine the copy and typography");
  await page
    .getByRole("button", { name: "Prepare changes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply changes", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("heading", { name: "Canvas edit saved" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("heading", { name: "Welcome to Test Studio" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Page version history" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restore", exact: true })
    .first()
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Page restored as a draft. The live website is unchanged.",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("heading", { name: "Canvas edit saved" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page
    .getByLabel("I reviewed these pages and approve publishing them.")
    .check();
  await page.getByRole("button", { name: "Publish now", exact: true }).click();
  const url = await page.getByLabel("Published website URL").inputValue();
  expect(url).toContain("/site/");
  const visitor = await context.browser()!.newContext();
  const livePage = await visitor.newPage();
  await livePage.goto(url);
  await expect(
    livePage.getByRole("heading", { name: "Canvas edit saved" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await page
    .getByRole("textbox", { name: "HTML", exact: true })
    .fill("<h1>Private unshared draft</h1>");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Changes saved.");
  await livePage.reload();
  await expect(
    livePage.getByRole("heading", { name: "Canvas edit saved" }),
  ).toBeVisible();
  await expect(
    livePage.getByRole("heading", { name: "Private unshared draft" }),
  ).not.toBeVisible();
  await visitor.close();
});

test("sidebar keeps website context, stable width and clear active selection", async ({
  page,
}) => {
  await page.goto("/website-builder");
  await page
    .getByLabel("Email", { exact: true })
    .fill("builder@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.getByRole("button", { name: "Sign in to Kora" }).click();
  await expect(
    page.getByRole("heading", { name: "Your websites" }),
  ).toBeVisible();
  const sidebar = page.getByRole("complementary", { name: "Website sidebar" });
  await sidebar.getByRole("button", { name: "Pages", exact: true }).click();
  await expect(sidebar.getByRole("status")).toContainText(
    /Choose a website|Create your first website/,
  );
  const websiteOptions = sidebar.getByLabel("Switch website").locator("option");
  if ((await websiteOptions.count()) > 1) {
    await sidebar
      .getByLabel("Switch website")
      .selectOption((await websiteOptions.nth(1).getAttribute("value")) || "");
    await expect(
      sidebar.getByRole("button", { name: "Overview", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await sidebar
      .getByRole("button", { name: "Website editor", exact: true })
      .click();
  } else {
    await page.getByLabel("Website name").fill("Sidebar Selection Studio");
    await page
      .getByRole("button", { name: "Create website", exact: true })
      .click();
  }
  await expect(
    sidebar.getByRole("button", { name: "Website editor", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(sidebar).not.toHaveClass(/is-collapsed/);
  const chosen = await sidebar.getByLabel("Switch website").inputValue();
  await sidebar
    .getByRole("button", { name: "All websites", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your websites" }),
  ).toBeVisible();
  await expect(sidebar.getByLabel("Switch website")).toHaveValue(chosen);
  await sidebar.getByRole("button", { name: "Pages", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pages", exact: true }),
  ).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: "Pages", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await sidebar
    .getByRole("button", { name: "Website settings", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.locator(
      'aside[aria-label="Website sidebar"] button[aria-label="Website settings"]',
    ),
  ).toHaveAttribute("aria-current", "page");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(
    sidebar.getByRole("button", { name: "Pages", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await sidebar.locator("summary").click();
  await expect(
    sidebar.getByText("These features will be added phase by phase."),
  ).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: "Services", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/sidebar-selection.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open website navigation" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Open website navigation" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Overview", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("canvas supports typography, context actions, section dragging and keyboard save", async ({
  page,
}) => {
  await page.goto("/website-builder");
  await page
    .getByLabel("Email", { exact: true })
    .fill("builder@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.getByRole("button", { name: "Sign in to Kora" }).click();
  await expect(
    page.getByRole("heading", { name: "Your websites" }),
  ).toBeVisible();
  const sites = await (await page.request.get("/api/kora/websites")).json();
  let site = sites.data[0];
  if (!site)
    site = (
      await (
        await page.request.post("/api/kora/websites", {
          headers: { origin: "http://localhost:4310" },
          data: { name: "Interaction Studio" },
        })
      ).json()
    ).data;
  const created = await page.request.post(
    `/api/kora/websites/${site._id}/pages`,
    {
      headers: { origin: "http://localhost:4310" },
      data: {
        title: "Polish lab",
        slug: `polish-${Date.now()}`,
        html: '<main><section id="hero"><h2>Professional typography</h2><p>Keep <strong>nested content</strong> intact.</p><a href="/book">Book a visit</a></section><section><h2>Services section</h2></section><section><h2>Contact section</h2></section></main>',
        css: "body{font-family:Arial;background:white;color:#222}section{padding:24px}h2{text-align:center;font-size:32px;line-height:1.5}",
      },
    },
  );
  expect(created.ok()).toBe(true);
  const record = (await created.json()).data;
  await page.reload();
  const sidebar = page.getByRole("complementary", { name: "Website sidebar" });
  await sidebar.getByLabel("Switch website").selectOption(site._id);
  await expect(
    sidebar.getByRole("button", { name: "Overview", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await sidebar
    .getByRole("button", { name: "Website editor", exact: true })
    .click();
  await page.getByLabel("Current page").selectOption(record._id);
  const frame = page.frameLocator('iframe[title="Polish lab preview"]');
  await frame
    .getByRole("heading", { name: "Professional typography" })
    .dblclick();
  const properties = page.getByRole("complementary", {
    name: "Element properties",
  });
  await expect(properties.getByLabel("Font size (px)")).toHaveValue("32");
  await expect(properties.getByLabel("Text alignment")).toHaveValue("center");
  await properties
    .getByRole("textbox", { name: "Text content", exact: true })
    .fill("Polished typography");
  await properties
    .getByRole("button", { name: "Apply manual changes" })
    .click();
  await expect(
    frame.getByRole("heading", { name: "Polished typography" }),
  ).toHaveCSS("text-align", "center");
  await expect(
    frame.getByRole("heading", { name: "Polished typography" }),
  ).toHaveCSS("font-size", "32px");
  await frame.getByRole("heading", { name: "Polished typography" }).dblclick();
  await properties.getByLabel("Typography size preset").selectOption("48");
  await properties.getByLabel("Font weight").selectOption("600");
  await properties.getByLabel("Line height", { exact: true }).fill("1.3");
  await properties.getByLabel("Letter spacing (px)").fill("1.2");
  await properties
    .getByRole("button", { name: "Apply manual changes" })
    .click();
  await expect(
    frame.getByRole("heading", { name: "Polished typography" }),
  ).toHaveCSS("font-size", "48px");
  await expect(
    frame.getByRole("heading", { name: "Polished typography" }),
  ).toHaveCSS("font-weight", "600");
  await expect(
    frame.getByRole("heading", { name: "Polished typography" }),
  ).toHaveCSS("letter-spacing", "1.2px");
  await frame
    .getByRole("heading", { name: "Polished typography" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Duplicate element" }).click();
  await expect(
    frame.getByRole("heading", { name: "Polished typography" }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Undo manual edit" }).click();
  await expect(
    frame.getByRole("heading", { name: "Polished typography" }),
  ).toHaveCount(1);
  await frame
    .getByText("Keep nested content intact.")
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Edit properties", exact: true })
    .click();
  await expect(
    properties.getByRole("textbox", { name: "Text content", exact: true }),
  ).toHaveCount(0);
  await properties.getByRole("button", { name: "Close properties" }).click();
  await frame
    .getByRole("link", { name: "Book a visit" })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Edit properties", exact: true })
    .click();
  await properties.getByLabel("Background", { exact: true }).fill("#6750a4");
  await properties.getByLabel("Corner radius (px)").fill("16");
  await properties.getByLabel("Horizontal padding (px)").fill("24");
  await properties.getByLabel("Vertical padding (px)").fill("12");
  await properties.getByLabel("Link destination").fill("javascript:alert(1)");
  await properties
    .getByRole("button", { name: "Apply manual changes" })
    .click();
  await expect(properties.getByRole("alert")).toContainText("https://");
  await properties.getByLabel("Link destination").fill("/contact");
  await properties
    .getByRole("button", { name: "Apply manual changes" })
    .click();
  await expect(frame.getByRole("link", { name: "Book a visit" })).toHaveCSS(
    "border-radius",
    "16px",
  );
  await expect(frame.getByRole("link", { name: "Book a visit" })).toHaveCSS(
    "padding-left",
    "24px",
  );
  await expect(
    frame.getByRole("link", { name: "Book a visit" }),
  ).toHaveAttribute("href", "/contact");
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  const layers = page.getByRole("region", { name: "Page sections" });
  await layers
    .getByRole("button", { name: "Drag section Contact section", exact: true })
    .dragTo(layers.locator(".wc-layer").first());
  await expect(layers.locator(".wc-layer").first()).toContainText(
    "Contact section",
  );
  await expect(frame.locator("main > section").first()).toContainText(
    "Contact section",
  );
  await page.getByRole("button", { name: "Undo manual edit" }).click();
  await expect(layers.locator(".wc-layer").first()).toContainText(
    "Polished typography",
  );
  await layers.getByRole("button", { name: "Move Contact section up" }).click();
  await expect(layers.locator(".wc-layer").nth(1)).toContainText(
    "Contact section",
  );
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("status")).toHaveText("Changes saved.");
  await page.screenshot({
    path: "test-results/editor-interactions.png",
    fullPage: true,
  });
  const saved = (
    await (
      await page.request.get(`/api/kora/websites/${site._id}/pages`)
    ).json()
  ).data.find((item: { _id: string }) => item._id === record._id);
  expect(saved.html.indexOf("Contact section")).toBeLessThan(
    saved.html.indexOf("Services section"),
  );
  expect(saved.css).toContain("font-size:48px");
  expect(saved.css).toContain("line-height:1.3");
  expect(saved.html).toContain("<strong>nested content</strong>");
  await frame
    .getByRole("heading", { name: "Polished typography" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Select parent" }).click();
  await expect(
    properties.getByText("SECTION element", { exact: true }),
  ).toBeVisible();
  await expect(properties.getByLabel("Horizontal padding (px)")).toHaveValue(
    "24",
  );
  await page.screenshot({
    path: "test-results/editor-properties.png",
    fullPage: true,
  });
  await properties.getByRole("button", { name: "Close properties" }).click();
  await frame.getByRole("heading", { name: "Polished typography" }).dblclick();
  await properties.getByLabel("Font size (px)").fill("44");
  await properties
    .getByRole("button", { name: "Apply manual changes" })
    .click();
  await frame
    .getByRole("heading", { name: "Polished typography" })
    .press("Control+s");
  await expect(
    page.getByRole("button", { name: "Undo manual edit" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await frame
    .getByRole("heading", { name: "Polished typography" })
    .press("Control+z");
  await expect(
    frame.getByRole("heading", { name: "Polished typography" }),
  ).toHaveCSS("font-size", "48px");
  await frame
    .getByRole("heading", { name: "Polished typography" })
    .press("Control+Shift+z");
  await expect(
    frame.getByRole("heading", { name: "Polished typography" }),
  ).toHaveCSS("font-size", "44px");
  await page.setViewportSize({ width: 390, height: 844 });
  await frame.getByRole("heading", { name: "Polished typography" }).dblclick();
  await expect(properties.getByLabel("Font size (px)")).toHaveValue("44");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/editor-properties-mobile.png",
    fullPage: true,
  });
});
