const {createRequire}=require('node:module'),path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
function dep(name){return require(require.resolve(name,{paths:[__dirname,path.resolve(__dirname,'../../character-walk')]}))}
const {chromium}=dep('playwright'),{PNG}=dep('pngjs'),jsQR=dep('jsqr');
const base=process.env.QA_URL||'http://127.0.0.1:8785/teamup-message-wall/';
const results=[];const records=[];let sockets=[],postCount=0,dropReply=false;
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','content-type':'application/json'};
const broadcast=row=>{for(const {ws,topic}of sockets)ws.send(JSON.stringify({topic,event:'postgres_changes',payload:{ids:[1],data:{schema:'public',table:'messages',type:'INSERT',columns:[{name:'id',type:'uuid'},{name:'name',type:'text'},{name:'message',type:'text'},{name:'created_at',type:'timestamptz'}],record:row,old_record:{},commit_timestamp:row.created_at,errors:null}},ref:null}))};
(async()=>{const b=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
 const context=await b.newContext({viewport:{width:1440,height:1100}});const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 const setup=await context.newPage();await setup.goto(base);await setup.getByText('尚未连接',{exact:true}).waitFor();assert.match(await setup.locator('#wallNotice').innerText(),/config.js/);results.push('Missing configuration is explained');await setup.close();
 await context.route('**/config.js',r=>r.fulfill({contentType:'text/javascript',body:'window.APP_CONFIG={SUPABASE_URL:"https://demo.supabase.co",SUPABASE_ANON_KEY:"sb_publishable_test_only"}'}));
 await context.route('https://demo.supabase.co/rest/v1/messages**',async r=>{
  const request=r.request(),url=new URL(request.url());
  if(request.method()==='OPTIONS')return r.fulfill({status:204,headers});
  if(request.method()==='POST'){
   postCount++;const input=request.postDataJSON();
   if(records.some(x=>x.id===input.id))return r.fulfill({status:409,headers,body:JSON.stringify({code:'23505',message:'duplicate'})});
   const row={...input,created_at:new Date().toISOString()};records.push(row);broadcast(row);
   if(dropReply){dropReply=false;return r.abort('failed')}
   return r.fulfill({status:201,headers,body:''});
  }
  const id=url.searchParams.get('id')?.slice(3);let rows=id?records.filter(x=>x.id===id):records.slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+Number(url.searchParams.get('limit')||1000));
  return r.fulfill({status:200,headers,body:JSON.stringify(rows)});
 });
 await context.routeWebSocket('wss://demo.supabase.co/realtime/v1/websocket**',ws=>{
  ws.onMessage(raw=>{const msg=JSON.parse(raw);if(msg.event==='phx_join'){sockets.push({ws,topic:msg.topic});ws.send(JSON.stringify({topic:msg.topic,event:'phx_reply',ref:msg.ref,payload:{status:'ok',response:{postgres_changes:[{id:1,event:'INSERT',schema:'public',table:'messages'}]}}}));}
   else if(msg.event==='heartbeat')ws.send(JSON.stringify({topic:'phoenix',event:'phx_reply',ref:msg.ref,payload:{status:'ok',response:{}}}));
  });
 });
 const wall=await context.newPage();await wall.goto(base);await wall.locator('#connection[data-state=live]').waitFor();
 const png=PNG.sync.read(await wall.locator('#qrcode').screenshot());assert.equal(jsQR(new Uint8ClampedArray(png.data),png.width,png.height).data,new URL('submit.html',base).href);results.push('QR decodes to submit.html under repository subpath');
 const phone=await context.newPage();await phone.setViewportSize({width:390,height:844});await phone.goto(new URL('submit.html',base).href);
 await phone.locator('#name').fill('   ');await phone.locator('#message').fill('hello');await phone.locator('#send').click();assert.equal(postCount,0);results.push('Whitespace-only name is rejected');
 await phone.locator('#name').fill('小林');await phone.locator('#message').fill('想找伙伴一起做一个有趣的展览。');await phone.locator('#send').click();await phone.locator('#success').waitFor({state:'visible'});await wall.getByText('想找伙伴一起做一个有趣的展览。',{exact:true}).waitFor();assert.equal(await wall.locator('.message-card').count(),1);results.push('Mobile submission arrives through real SDK + mocked Realtime WebSocket');
 broadcast(records[0]);await wall.waitForTimeout(200);assert.equal(await wall.locator('.message-card').count(),1);results.push('Repeated events do not duplicate cards');
 await phone.locator('#another').click();await phone.locator('#name').fill('<img src=x onerror=alert(1)>');await phone.locator('#message').fill('<script>window.hacked=true</script>');await phone.locator('#send').click();await phone.locator('#success').waitFor({state:'visible'});await wall.getByText('<script>window.hacked=true</script>',{exact:true}).waitFor();assert.equal(await wall.locator('.message-card img,.message-card script').count(),0);results.push('User text cannot execute HTML');
 await phone.locator('#another').click();await phone.locator('#name').fill('阿蓝');await phone.locator('#message').fill('网络重试只保存一次');dropReply=true;await phone.locator('#send').click();await phone.locator('#formStatus.error').waitFor();assert.equal(await phone.locator('#message').inputValue(),'网络重试只保存一次');await phone.locator('#send').click();await phone.locator('#success').waitFor({state:'visible'});assert.equal(records.filter(x=>x.name==='阿蓝').length,1);results.push('Lost acknowledgement + retry reuses record ID');
 await wall.screenshot({path:path.join(__dirname,'desktop.png'),fullPage:true});await phone.locator('#another').click();await phone.screenshot({path:path.join(__dirname,'mobile.png'),fullPage:true});
 for(let i=0;i<1002;i++)records.push({id:'test-'+String(i).padStart(5,'0'),name:'分页测试',message:'分页 '+i,created_at:new Date(Date.now()+i+100).toISOString()});
 await wall.reload();await wall.waitForFunction(n=>document.querySelectorAll('.message-card').length===n,records.length);results.push('All 1005 rows loaded across page limits');
 records.push({id:'missed-during-offline',name:'补读测试',message:'断线期间新增',created_at:new Date(Date.now()+5000).toISOString()});await wall.evaluate(()=>window.dispatchEvent(new Event('online')));await wall.getByText('断线期间新增',{exact:true}).waitFor();results.push('Reconnect catches missed inserts');
 for(const page of [phone,wall]){await page.setViewportSize({width:375,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}results.push('375px mobile layouts have no horizontal overflow');
 assert.deepEqual(errors,[]);results.push('No browser JavaScript errors');fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify({passed:results,scope:'Real browser and Supabase SDK; simulated database and WebSocket. Live RLS not yet verified.'},null,2));console.log(JSON.stringify(results,null,2));
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});

