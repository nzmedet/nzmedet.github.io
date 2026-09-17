const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=process.env.SITE_ROOT||path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res)});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch();try{
 for(const scenario of [
  {name:'New Zealand automatically starts',body:'loc=NZ\nip=not-used',on:true},
  {name:'Australia automatically starts',body:'loc=AU',on:true},
  {name:'United States automatically starts',body:'loc=US',on:true},
  {name:'Germany waits for acceptance',body:'loc=DE',on:false},
  {name:'UK waits for acceptance',body:'loc=GB',on:false},
  {name:'Switzerland waits for acceptance',body:'loc=CH',on:false},
  {name:'EEA country Norway waits',body:'loc=NO',on:false},
  {name:'Unknown location waits',body:'loc=XX',on:false},
  {name:'Unrecognised country waits',body:'loc=AA',on:false},
  {name:'Tor location waits',body:'loc=T1',on:false},
  {name:'Malformed response waits',body:'<html>unavailable</html>',on:false},
  {name:'Network failure waits',fail:true,on:false},
  {name:'Prior decline wins over region',body:'loc=NZ',choice:'denied',on:false},
  {name:'Prior acceptance works in opt-in region',body:'loc=DE',choice:'granted',on:true},
  {name:'GPC prevents automatic analytics',body:'loc=NZ',gpc:true,on:false},
  {name:'DNT prevents automatic analytics',body:'loc=AU',dnt:true,on:false}
 ]){
  const context=await browser.newContext({viewport:{width:390,height:844}});let tags=0,geo=0;
  await context.addInitScript(({choice,gpc,dnt})=>{if(choice)localStorage.setItem('tsx-analytics-choice',JSON.stringify({choice,expires:Date.now()+100000}));if(gpc)Object.defineProperty(navigator,'globalPrivacyControl',{value:true});if(dnt)Object.defineProperty(navigator,'doNotTrack',{value:'1'});},scenario);
  await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(base))return route.continue();if(url.includes('/cdn-cgi/trace')){geo++;return scenario.fail?route.abort():route.fulfill({status:200,contentType:'text/plain',body:scenario.body||''})}if(url.includes('googletagmanager.com/gtag/js'))tags++;return route.fulfill({status:200,contentType:'text/javascript',body:''});});
  const p=await context.newPage();await p.goto(base+'/gargantua/');await p.waitForTimeout(1800);
  assert.equal(tags,scenario.on?1:0,scenario.name);
  if(scenario.choice)assert.equal(geo,0,'A saved explicit choice needs no location lookup');
  if(scenario.on&&!scenario.choice){await context.addCookies([{name:'_ga',value:'continuity-check',url:base}]);await p.goto(base+'/cell/');await p.waitForTimeout(200);assert.equal((await context.cookies()).find(c=>c.name==='_ga')?.value,'continuity-check','Regional lookup must preserve an existing permitted visitor cookie across pages');assert.match(await p.locator('#tsx-analytics-consent').innerText(),/on|enabled/i);await p.getByRole('button',{name:'Turn off',exact:true}).click();await p.goto(base+'/cell/');await p.waitForTimeout(100);assert.equal(tags,2,'Turning off must carry across pages');}
  if(!scenario.on&&!scenario.choice&&!scenario.gpc&&!scenario.dnt){await p.getByRole('button',{name:'Accept analytics',exact:true}).click();await p.waitForTimeout(100);assert.equal(tags,1,'Explicit acceptance enables Google');}
  console.log('PASS: '+scenario.name);await context.close();
 }
 // A late location response must never override a choice made meanwhile.
 const context=await browser.newContext();let release,requested,tags=0;const pending=new Promise(r=>release=r);const seen=new Promise(r=>requested=r);
 await context.route('**/*',async route=>{const url=route.request().url();if(url.startsWith(base))return route.continue();if(url.includes('/cdn-cgi/trace')){requested();await pending;return route.fulfill({status:200,contentType:'text/plain',body:'loc=NZ'})}if(url.includes('googletagmanager.com/gtag/js'))tags++;return route.fulfill({status:200,body:''})});
 const p=await context.newPage();await p.goto(base+'/');await Promise.race([seen,new Promise((_,r)=>setTimeout(()=>r(Error('Country lookup did not run')),2000))]);await p.getByRole('button',{name:'Analytics preferences',exact:true}).click();await p.getByRole('button',{name:'Decline',exact:true}).click();release();await p.waitForTimeout(200);assert.equal(tags,0,'A late default-on response must not undo Decline');await context.close();console.log('PASS: late location response respects explicit decline');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
