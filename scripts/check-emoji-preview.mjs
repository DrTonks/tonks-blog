import assert from 'node:assert/strict';

export async function checkEmojiPreview(page, source, parentModal) {
  await source.scrollIntoViewIfNeeded();
  const before = await source.boundingBox();
  await source.hover();
  assert.equal(await source.evaluate(el => getComputedStyle(el).transform), 'none');
  assert.deepEqual(await source.boundingBox(), before, 'hover must not enlarge the emoji');
  await source.click();
  const preview = page.locator('dialog.community-image-preview');
  await preview.waitFor();
  assert(await preview.evaluate(el => el.matches(':modal')));
  const image = preview.locator('img');
  await image.evaluate(img => img.decode());
  assert.equal(await image.getAttribute('src'), await source.evaluate(el => el.currentSrc || el.src));
  assert((await image.boundingBox()).width > before.width);
  const bounds = await preview.boundingBox();
  const viewport = page.viewportSize();
  assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1);
  await image.click();
  assert(await preview.isVisible(), 'clicking the enlarged image must not close it');
  if (process.env.EMOJI_PREVIEW_SCREENSHOT) await page.screenshot({path:process.env.EMOJI_PREVIEW_SCREENSHOT});
  await page.keyboard.press('Escape');
  await preview.waitFor({state:'detached'});
  if (parentModal) assert(await parentModal.isVisible(), 'Escape must preserve the parent dialog');
  assert(await source.evaluate(el => document.activeElement === el));
  await source.press('Enter');
  await preview.waitFor();
  await preview.getByRole('button', {name:'关闭预览 ×',exact:true}).click();
  await preview.waitFor({state:'detached'});
  await source.press('Space');
  await preview.waitFor();
  await page.mouse.click(2,2);
  await preview.waitFor({state:'detached'});
  if (parentModal) assert(await parentModal.isVisible());
}
