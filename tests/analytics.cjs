// Run with Node and Playwright available: node tests/analytics.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = process.env.SITE_ROOT || path.resolve(__dirname, '..');
const key = 'tsx-analytics-choice';
const server = http.createServer((req, res) => {
  let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css'};
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({headless:true});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    const requests = [];
    await context.route('**/*', route => {
      if (route.request().url().startsWith(base)) return route.continue();
      requests.push(route.request().url());
      if (route.request().url().includes('/cdn-cgi/trace')) return route.fulfill({status:200,contentType:'text/plain',body:'loc=GB'});
      // Keep tests offline and prevent test visits from reaching real Analytics.
      return route.fulfill({status:200,contentType:'text/javascript',body:''});
    });
    const page = await context.newPage();
    const tagRequests = () => requests.filter(u=>u.includes('googletagmanager.com/gtag/js'));
    const go = async p => { await page.goto(base+p); await page.waitForTimeout(100); };
    await go('/gargantua/');
    assert.equal(await page.getByRole('button',{name:'Accept analytics',exact:true}).count(),1,'Visitors must have an analytics choice');
    assert.equal(tagRequests().length,0,'No Google tag may load before consent');
    const startScroll = await page.evaluate(()=>scrollY);
    await page.getByRole('button',{name:'Decline',exact:true}).click();
    assert.equal(await page.evaluate(()=>scrollY),startScroll,'Choosing analytics must not jump to the footer or create false scroll events');
    assert.equal(await page.evaluate(()=>document.querySelector('main').contains(document.activeElement)),true,'Initial dismissal must restore focus in the visible page content');
    await go('/cell/');
    assert.equal(tagRequests().length,0,'Declining must persist across pages');
    assert.equal(await page.getByRole('button',{name:'Accept analytics',exact:true}).isVisible(),false);
    await page.getByRole('button',{name:'Analytics preferences',exact:true}).click();
    await page.getByRole('button',{name:'Accept analytics',exact:true}).click();
    await page.waitForTimeout(100);
    assert.equal(tagRequests().length,1,'Accepting must load Google exactly once');
    const layer = await page.evaluate(()=>window.dataLayer.map(args=>Array.from(args)));
    assert.equal(layer.filter(a=>a[0]==='config').length,1,'Accepting must configure only one page view');
    const config = layer.find(a=>a[0]==='config')[2];
    assert.equal(config.allow_google_signals,false);
    assert.equal(config.allow_ad_personalization_signals,false);
    const consent = layer.filter(a=>a[0]==='consent').at(-1)[2];
    assert.equal(consent.analytics_storage,'granted');
    for(const type of ['ad_storage','ad_user_data','ad_personalization']) assert.equal(consent[type],'denied');
    await go('/cosmic/');
    assert.equal(tagRequests().length,2,'Accepted choice must carry to the next page');
    await context.addCookies([{name:'_ga',value:'example',url:base},{name:'_ga_D6L9JQQSBH',value:'example',url:base}]);
    await page.getByRole('button',{name:'Analytics preferences',exact:true}).click();
    await page.getByRole('button',{name:'Turn off',exact:true}).click();
    assert.equal(await page.evaluate(()=>window['ga-disable-G-D6L9JQQSBH']),true,'Revocation must disable the active tag');
    assert.equal((await context.cookies()).filter(c=>c.name.startsWith('_ga')).length,0,'Revocation must remove Analytics cookies');
    await go('/');
    assert.equal(tagRequests().length,2,'Revoked consent must block Analytics on the next page');
    for (const stored of ['broken JSON',JSON.stringify({choice:'granted',expires:1})]) {
      await page.evaluate(([k,v])=>localStorage.setItem(k,v),[key,stored]);
      await go('/gargantua/privacy.html');
      assert.equal(await page.getByRole('button',{name:'Accept analytics',exact:true}).isVisible(),true,'Invalid or expired preferences must ask again');
      assert.equal(tagRequests().length,2);
    }
    console.log('PASS: consent gating, persistence, single initialization, advertising disabled, revocation, expiry');
    await context.close();
    const blocked = await browser.newContext();
    await blocked.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.fulfill({status:200,body:route.request().url().includes('/cdn-cgi/trace')?'loc=GB':''}));
    await blocked.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error('blocked')};Storage.prototype.setItem=()=>{throw new Error('blocked')};});
    const p = await blocked.newPage();
    await p.goto(base+'/');
    await p.getByRole('button',{name:'Decline',exact:true}).click();
    assert.equal(await p.getByRole('button',{name:'Accept analytics',exact:true}).isVisible(),false,'Blocked storage must not break the choice');
    console.log('PASS: blocked browser storage remains usable');
    await blocked.close();
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
