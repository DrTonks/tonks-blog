import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');
const origin=process.env.POLL_TEST_ORIGIN || 'http://127.0.0.1:4335',api=process.env.POLL_TEST_API || 'http://127.0.0.1:9013';
for(const url of [origin,api])assert.equal(new URL(url).hostname,'127.0.0.1','Tests must use local preview');
assert.equal((await (await fetch(api+'/health')).json()).preview,true);
const browser=await chromium.launch({channel:'msedge',headless:true});
const created=[];let cleanupEndpoint;
try{
 const context=await browser.newContext({viewport:{width:1360,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname.replace(/^\/api/,'');
  if(path.startsWith('/blog/community/articles/')||path.startsWith('/blog/community/polls/')){const response=await route.fetch({url:api+path+new URL(route.request().url()).search});await route.fulfill({response});}
  else await route.fulfill({json:{success:true,views:{},likes:{},posts:[],emojis:[]}});
 });
 await page.goto(origin+'/posts/writing-guide/',{waitUntil:'domcontentloaded'});
 const map=JSON.parse(await page.locator('[data-article-comment-map]').textContent());
 assert.equal(map.blocks.filter(b=>b.id.startsWith('poll:')).length,2);
 const endpoint=api+'/blog/community/articles/'+map.id+'/comments';cleanupEndpoint=endpoint;const run=String(Date.now());
 const create=async(block_id,content,parent_id=null)=>{const r=await page.request.post(endpoint,{headers:{'X-Admin-Secret':'local-preview'},data:{nickname:'Test',email:'test@example.com',content,block_id,parent_id,version:map.version}});assert.equal(r.status(),200,await r.text());const id=(await r.json()).id;created.push(id);return id;};
 const quizText='QUIZ_SECRET_'+run,openText='OPEN_DISCUSSION_'+run,replyText='QUIZ_REPLY_'+run;
 const quizId=await create('poll:guide-markdown-quiz-v1',quizText);await create('poll:guide-markdown-quiz-v1',replyText,quizId);await create('poll:guide-reading-v1',openText);
 await page.reload({waitUntil:'domcontentloaded'});
 const quiz=page.locator('[data-poll-id="guide-markdown-quiz-v1"]'),poll=page.locator('[data-poll-id="guide-reading-v1"]');
 await quiz.locator('.poll-discussion').filter({hasText:'作答后解锁讨论'}).waitFor();assert(await quiz.locator('.poll-discussion').isDisabled());
 await page.locator('[data-ac-main-list]').getByText(openText,{exact:true}).waitFor();assert(!(await page.locator('[data-ac-main-list]').textContent()).includes(quizText));
 await poll.locator('.poll-discussion').click();await page.locator('[data-ac-dialog-list]').getByText(openText,{exact:true}).waitFor();await page.locator('[data-ac-close]').click();await page.locator('[data-ac-dialog]').waitFor({state:'hidden'});
 await quiz.scrollIntoViewIfNeeded();await quiz.locator('fieldset:not([disabled])').waitFor();await quiz.locator('input').first().check();await quiz.locator('.poll-submit').click();
 await quiz.locator('.poll-discussion:not([disabled])').waitFor();await page.locator('[data-ac-main-list]').getByText(quizText,{exact:true}).waitFor();await page.locator('[data-ac-main-list]').getByText(replyText,{exact:true}).waitFor();
 await quiz.locator('.poll-discussion').click();await page.locator('[data-ac-dialog-list]').getByText(replyText,{exact:true}).waitFor();await page.locator('[data-ac-close]').click();await page.locator('[data-ac-dialog]').waitFor({state:'hidden'});
 await page.setViewportSize({width:390,height:844});await quiz.scrollIntoViewIfNeeded();assert(await quiz.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 if(process.env.POLL_TEST_SCREENSHOT)await page.screenshot({path:process.env.POLL_TEST_SCREENSHOT});
 await page.reload({waitUntil:'domcontentloaded'});await quiz.locator('.poll-discussion:not([disabled])').waitFor();
 await context.clearCookies();await page.evaluate(()=>localStorage.removeItem('tonks_community_identity'));await page.reload({waitUntil:'domcontentloaded'});await quiz.locator('.poll-discussion:disabled').filter({hasText:'作答后解锁讨论'}).waitFor();await page.locator('[data-ac-main-list]').getByText(openText,{exact:true}).waitFor();assert(!(await page.locator('[data-ac-main-list]').textContent()).includes(quizText));
 assert.deepEqual(errors,[]);console.log('PASS real Edge: open poll discussion, quiz locked tree, vote unlock, nested replies, reload identity, new identity re-lock and mobile layout');
}finally{
 await browser.close();
 for(const id of created)await fetch(cleanupEndpoint+'/'+id,{method:'DELETE',headers:{'X-Admin-Secret':'local-preview'}});
}
