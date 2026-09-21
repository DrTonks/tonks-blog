// Real browser regression. All API requests are mocked; no production writes.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');
const origin=process.env.ARCHIVE_TEST_BASE_URL||'http://127.0.0.1:4333';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1360,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let countedId;const requests=new Map();
  await page.route('**/api/**',async route=>{
    const match=new URL(route.request().url()).pathname.match(/\/articles\/([^/]+)\/comments$/);
    if(match){
      countedId??=match[1];requests.set(match[1],(requests.get(match[1])||0)+1);
      return route.fulfill({json:{success:true,count:match[1]===countedId?3:0,comments:[],counts:{}}});
    }
    return route.fulfill({json:{success:true,views:{},likes:{},posts:[]}});
  });
  await page.goto(`${origin}/archive/`,{waitUntil:'domcontentloaded'});
  const counter=page.locator('.entry-comments:not([hidden])').first();await counter.waitFor();
  assert.equal(await counter.locator('span').textContent(),'3');
  const row=counter.locator('xpath=ancestor::a[1]');await row.scrollIntoViewIfNeeded();
  const order=await row.evaluate(el=>{const title=el.querySelector('.entry-title').getBoundingClientRect(),count=el.querySelector('.entry-comments').getBoundingClientRect(),tags=el.querySelector('.entry-tags').getBoundingClientRect();return title.right<=count.left&&count.right<=tags.left;});
  assert(order,'counter should be between title and tags');
  // textContent becomes "0" only after the zero response is actually applied.
  await page.waitForFunction(()=>[...document.querySelectorAll('.entry-comments[hidden] > span')].some(el=>el.textContent==='0'));
  const category=await row.locator('.entry-category-icon').getAttribute('aria-label');
  const before=requests.get(countedId);
  await page.locator('.archive-category-bar button').filter({hasText:category}).first().click();
  await counter.waitFor();assert.equal(requests.get(countedId),before,'filtered remount should use count cache');
  for(const dark of [false,true])for(const gold of [false,true]){
    await page.evaluate(({dark,gold})=>{document.documentElement.classList.toggle('dark',dark);document.documentElement.dataset.accentLight=gold?'gold':'blue';document.documentElement.dataset.accentDark=gold?'gold':'blue';},{dark,gold});
    await row.hover();await page.waitForTimeout(350);
    assert(await row.evaluate(el=>getComputedStyle(el).color===getComputedStyle(el.querySelector('.entry-comments')).color),'hover counter follows inverse foreground');
  }
  if(process.env.ARCHIVE_SCREENSHOTS)await page.screenshot({path:'.cache/archive-counts-desktop.png'});
  await page.setViewportSize({width:390,height:844});await row.scrollIntoViewIfNeeded();
  assert(await row.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'mobile row must not overflow');
  assert(await counter.isVisible());
  if(process.env.ARCHIVE_SCREENSHOTS)await page.screenshot({path:'.cache/archive-counts-mobile.png'});
  await page.waitForFunction(()=>Boolean(window.swup?.hooks));
  await page.evaluate(()=>new Promise(resolve=>{window.swup.hooks.once('visit:end',resolve);window.swup.navigate('/');}));
  const home=page.locator(`.post-card__comments[data-article-count="${countedId}"]`);
  await home.locator('xpath=ancestor::*[contains(@class,"post-card")][1]').scrollIntoViewIfNeeded();await home.waitFor();
  assert.equal(await home.locator('span').textContent(),'3');
  await page.evaluate(()=>new Promise(resolve=>{window.swup.hooks.once('visit:end',resolve);window.swup.navigate('/archive/');}));
  await counter.waitFor();assert.equal(await counter.locator('span').textContent(),'3');
  assert.deepEqual(errors,[]);console.log('PASS: archive count layout, zero hiding, filter cache, four themes, mobile, home and Swup');
}finally{await browser.close();}
