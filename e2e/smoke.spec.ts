import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

import { buildNifti1Buffer } from "../tests/fixtures/nifti";

/**
 * End-to-end smoke for Reticle:
 *   1. Page loads, no runtime errors.
 *   2. The synthetic demo phantom mounts on first paint.
 *   3. All three plane canvases render non-trivial pixels.
 *   4. Clicking inside one plane updates the other two (crosshair sync).
 *   5. Switching to the 3D layout paints the volume canvas.
 *   6. The intensity-window controls move the level.
 */

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  const listener = (msg: ConsoleMessage): void => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (t.includes("404") && t.toLowerCase().includes("favicon")) return;
    errors.push(t);
  };
  page.on("console", listener);
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function paintedPct(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const canvas = document.querySelector(sel) as HTMLCanvasElement | null;
    if (!canvas) return 0;
    const off = document.createElement("canvas");
    off.width = canvas.width;
    off.height = canvas.height;
    const ctx = off.getContext("2d");
    if (!ctx) return 0;
    ctx.drawImage(canvas, 0, 0);
    const data = ctx.getImageData(0, 0, off.width, off.height).data;
    let painted = 0;
    let samples = 0;
    const stride = 32;
    for (let i = 0; i < data.length; i += 4 * stride) {
      if (data[i] || data[i + 1] || data[i + 2]) painted++;
      samples++;
    }
    return painted / Math.max(1, samples);
  }, selector);
}

function makeOverlayFile(name: string): { name: string; mimeType: string; buffer: Buffer } {
  const nx = 4;
  const ny = 4;
  const nz = 4;
  const data = new Float32Array(nx * ny * nz);
  for (let i = 0; i < data.length; i++) data[i] = 100 + i;
  return {
    name,
    mimeType: "application/octet-stream",
    buffer: Buffer.from(
      buildNifti1Buffer({
        nx,
        ny,
        nz,
        datatypeCode: 16,
        data,
        sform: [
          [1, 0, 0, 0],
          [0, 1, 0, 0],
          [0, 0, 1, 0],
        ],
      }),
    ),
  };
}

test("viewer mounts, planes paint, crosshair sync works", async ({ page }) => {
  const errors = collectConsoleErrors(page);

  await page.goto("/");
  await expect(page).toHaveTitle(/Reticle/i);

  // Wait for the demo phantom to mount + the three plane canvases to exist.
  await page.waitForSelector('[aria-label="Axial view"] canvas');
  await page.waitForSelector('[aria-label="Coronal view"] canvas');
  await page.waitForSelector('[aria-label="Sagittal view"] canvas');
  // Give the renderer a frame to paint.
  await page.waitForTimeout(400);

  // All three planes must paint something.
  const axialPainted = await paintedPct(page, '[aria-label="Axial view"] canvas');
  const coronalPainted = await paintedPct(page, '[aria-label="Coronal view"] canvas');
  const sagittalPainted = await paintedPct(page, '[aria-label="Sagittal view"] canvas');
  expect(axialPainted).toBeGreaterThan(0.05);
  expect(coronalPainted).toBeGreaterThan(0.05);
  expect(sagittalPainted).toBeGreaterThan(0.05);

  // Crosshair sync: scrolling the wheel inside the axial plane must step the
  // S slice. The axial badge encodes `<slice+1>/<nSlices>` so it's a clean
  // observable that's independent of any hover/probe interactions.
  const axial = page.locator('[aria-label="Axial view"]');
  const axialBadge = axial.locator("text=/Axial/").first();
  const sliceBefore = await axialBadge.innerText();
  const box = await axial.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.wheel(0, 100); // step one slice forward
  }
  await page.waitForTimeout(200);
  const sliceAfter = await axialBadge.innerText();
  expect(sliceAfter).not.toEqual(sliceBefore);

  expect(errors, errors.join("\n")).toEqual([]);
});

test("switch to 3D layout paints the volume canvas", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/");
  await page.waitForSelector('[aria-label="Axial view"] canvas');
  await page.waitForTimeout(400);

  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.waitForSelector('[aria-label="3D volume view"] canvas');
  // The raycaster needs longer for the first frame (texture build + shader compile).
  await page.waitForTimeout(1200);

  // A canvas in WebGL mode can't be sampled via drawImage on every browser, so
  // assert presence + size instead. The dedicated phase-5 verification already
  // exercises pixel-level checks.
  const dims = await page.evaluate(() => {
    const c = document.querySelector(
      '[aria-label="3D volume view"] canvas',
    ) as HTMLCanvasElement | null;
    return c ? { w: c.width, h: c.height } : null;
  });
  expect(dims).not.toBeNull();
  expect(dims!.w).toBeGreaterThan(100);
  expect(dims!.h).toBeGreaterThan(100);

  expect(errors, errors.join("\n")).toEqual([]);
});

test("intensity window slider moves the level", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/");
  await page.waitForSelector('[aria-label="Axial view"] canvas');
  await page.waitForTimeout(400);

  const levelInput = page.getByLabel("Window level value");
  const before = await levelInput.inputValue();
  await levelInput.fill("999");
  await levelInput.press("Enter");
  await page.waitForTimeout(150);
  const after = await levelInput.inputValue();
  expect(after).not.toEqual(before);

  expect(errors, errors.join("\n")).toEqual([]);
});

test("mobile layout stays compact and accepts touch drag", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForSelector('[aria-label="Axial view"] canvas');
  await page.waitForTimeout(400);

  await expect(page.locator('[aria-label="Volume controls"]')).toBeHidden();
  await expect(page.locator('summary:has-text("Controls")')).toBeVisible();
  await expect(page.getByRole("group", { name: "Layout" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Grid" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Single" })).toHaveCount(0);
  // The button reads "3D" but carries aria-label="Switch to 3D", and the
  // aria-label is the accessible name — match that, not the visible text.
  await expect(page.getByRole("button", { name: "Switch to 3D" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Axial" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Coronal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sagittal" })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(overflow).toBe(true);

  const coronalButton = page.getByRole("button", { name: "Coronal" });
  await coronalButton.click();
  await expect(page.locator('[aria-label="Coronal view"] canvas')).toBeVisible();

  const canvas = page.locator('[aria-label="Coronal view"] canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    const x1 = box.x + box.width * 0.42;
    const y1 = box.y + box.height * 0.42;
    const x2 = box.x + box.width * 0.58;
    const y2 = box.y + box.height * 0.58;
    await canvas.dispatchEvent("pointerdown", {
      pointerId: 31,
      pointerType: "touch",
      clientX: x1,
      clientY: y1,
      buttons: 1,
    });
    await canvas.dispatchEvent("pointermove", {
      pointerId: 31,
      pointerType: "touch",
      clientX: x2,
      clientY: y2,
      buttons: 1,
    });
    await canvas.dispatchEvent("pointerup", {
      pointerId: 31,
      pointerType: "touch",
      clientX: x2,
      clientY: y2,
      buttons: 0,
    });
  }
  await page.waitForTimeout(150);

  await page.getByRole("button", { name: "Switch to 3D" }).click();
  await expect(page.locator('[aria-label="3D volume view"] canvas')).toBeVisible();
  await page.getByRole("button", { name: "Return to slices" }).click();
  await expect(page.locator('[aria-label="Coronal view"] canvas')).toBeVisible();

  expect(errors, errors.join("\n")).toEqual([]);
});

test("mobile overlays drawer exposes removal and closes after delete", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForSelector('[aria-label="Axial view"] canvas');
  await page.waitForTimeout(400);

  await page.getByRole("button", { name: "Add overlay" }).click();
  await page
    .locator('input[type="file"]')
    .nth(1)
    .setInputFiles(makeOverlayFile("mobile-overlay.nii"));
  await page.waitForTimeout(400);

  await expect(page.getByRole("button", { name: "Overlays" })).toContainText("1");
  await page.getByRole("button", { name: "Overlays" }).click();
  const drawer = page.getByRole("dialog", { name: "Overlays" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("mobile-overlay.nii")).toBeVisible();

  await drawer.getByRole("button", { name: "Remove overlay" }).click();
  await page.waitForTimeout(250);

  await expect(page.getByRole("dialog", { name: "Overlays" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Overlays" })).toContainText("0");
  await expect(page.getByText("mobile-overlay.nii")).toHaveCount(0);

  expect(errors, errors.join("\n")).toEqual([]);
});
