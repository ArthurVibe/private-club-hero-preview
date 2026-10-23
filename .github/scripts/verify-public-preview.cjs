const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PRIVATE_CLUB_PLAYWRIGHT_MODULE||'playwright');
const target=process.env.PRIVATE_CLUB_PREVIEW_URL||'https://arthurvibe.github.io/private-club-hero-preview/';
(async()=>{
 const external=!['localhost','127.0.0.1'].includes(new URL(target).hostname);
 const proxy=external&&(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)?{server:process.env.HTTPS_PROXY||process.env.HTTP_PROXY}:undefined;
 const b=await chromium.launch({executablePath:process.env.PRIVATE_CLUB_CHROME_EXECUTABLE||'/usr/bin/google-chrome',args:['--no-sandbox'],proxy});
 const results=[],errors=[],failed=[];
 const p=await b.newPage({viewport:{width:1440,height:900}});
 p.on('pageerror',e=>errors.push(e.message));p.on('requestfailed',r=>failed.push(r.url()));
 const response=await p.goto(target);assert.equal(response.status(),200);assert(response.url().startsWith('https://arthurvibe.github.io/private-club-hero-preview/'));await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(700);
 const assets=await p.evaluate(()=>({photo:{loaded:document.querySelector('#club-photo').complete,width:document.querySelector('#club-photo').naturalWidth},font:[...document.fonts].map(f=>({family:f.family,status:f.status}))}));
 assert.equal(assets.photo.width,2560);assert(assets.font.some(f=>f.family.includes('Playfair')&&f.status==='loaded'));results.push({test:'Image and Playfair Display font loaded',status:'passed',assets});
 for(const[s,lift,wave]of[['#meet-bro',6,'bronze-reflection'],['.button-outline',4,'none'],['.invitation',4,'bronze-reflection']]){
  await p.mouse.move(700,870);await p.waitForTimeout(650);const before=await p.locator(s).boundingBox();await p.locator(s).hover();await p.waitForTimeout(450);
  assert.deepEqual(await p.locator(s).boundingBox(),before);
  const state=await p.locator(s+' .button-face').evaluate(e=>({dy:new DOMMatrix(getComputedStyle(e).transform).m42,wave:getComputedStyle(e,'::before').animationName}));assert.equal(state.dy,-lift);assert.equal(state.wave,wave);
  await p.locator(s).click();assert.equal(await p.locator('#notice-message').innerText(),'Coming soon');await p.keyboard.press('Escape');results.push({test:s+' hover and Coming soon',status:'passed',state});
 }
 await p.locator('.brand').hover();await p.waitForTimeout(200);assert.equal(await p.locator('.wordmark-bottom').evaluate(e=>getComputedStyle(e,'::after').animationName),'living-engraving');results.push({test:'BRO? sheen',status:'passed'});
 const t=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});t.on('pageerror',e=>errors.push(e.message));t.on('requestfailed',r=>failed.push(r.url()));await t.goto(target);await t.evaluate(()=>document.fonts.ready);await t.waitForTimeout(700);await t.locator('#menu-toggle').tap();assert.equal(await t.locator('#menu-toggle').getAttribute('aria-expanded'),'true');await t.locator('.invitation').tap();assert.equal(await t.locator('#notice-message').innerText(),'Coming soon');await t.locator('#notice-close').tap();assert.equal(await t.locator('#menu-toggle').getAttribute('aria-expanded'),'false');assert(await t.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));results.push({test:'Mobile menu, invitation, close and no horizontal overflow',status:'passed'});
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 const report={target,sourceCommit:'5a4810f0a4a40b7a377a38728ae4ae7a85af5f1c',browser:await b.version(),touch:'emulated',tlsVerification:true,security:await response.securityDetails(),results,errors,failed};fs.writeFileSync('public-preview-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
