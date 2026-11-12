(() => {
 const $=id=>document.getElementById(id),site='https://street-character-walk-1102.red-alder-8721.chatgpt.site',storageKey='teamup-private-profile-v2';
 let db,sending=false,pending=null,step=1,appearance='choice-01',owner=null;
 try{db=Teamup.client()}catch(error){$('formStatus').textContent=error.message;$('formStatus').classList.add('error');$('send').disabled=true}
 const fields=['name','mbti','skills','interests','message'];
 for(const mbti of TeamupProfile.mbtis){const option=document.createElement('option');option.value=mbti;option.textContent=mbti==='未测'?'还没测／不确定':mbti;$('mbti').append(option)}
 function validate(id){const input=$(id);let error='';
  if(!input.value.trim())error=({name:'请填写你的昵称。',mbti:'请选择 MBTI，或选择「还没测／不确定」。',message:'请写一段自我介绍。'})[id]||'请至少填写一项。';
  else if(id==='skills'||id==='interests'){try{TeamupProfile.parseTags(input.value)}catch(e){error=e.message}}
  input.setCustomValidity(error);input.setAttribute('aria-invalid',String(!!error));$(id+'Error').textContent=error;return !error}
 for(const id of fields){$(id).addEventListener('blur',()=>validate(id));$(id).addEventListener('input',()=>{if($(id).getAttribute('aria-invalid')==='true')validate(id);$('formStatus').textContent=''})}
 $('mbti').addEventListener('change',()=>validate('mbti'));
 function suggestions(id,container,values){
  const sync=()=>{const selected=$(id).value.split(/[,，、;；\n]+/).map(s=>s.trim());for(const b of $(container).children)b.setAttribute('aria-pressed',String(selected.includes(b.textContent)))};
  for(const value of values){const button=document.createElement('button');button.type='button';button.textContent=value;button.setAttribute('aria-pressed','false');button.onclick=()=>{
   let tags=[...new Set($(id).value.split(/[,，、;；\n]+/).map(s=>s.trim()).filter(Boolean))];
   if(tags.includes(value))tags=tags.filter(s=>s!==value);else if(tags.length>=5){$(id+'Error').textContent='最多选择 5 项，请先取消一项。';return}else tags.push(value);
   $(id).value=tags.join('、');sync();validate(id)};$(container).append(button)}
  $(id).addEventListener('input',sync);return sync
 }
 const syncSkills=suggestions('skills','skillSuggestions',['视觉设计','编程','摄影','文案','剪辑','策划','UI设计','产品设计','交互设计','活动策划','工程开发','AI应用','数据分析']);
 const syncInterests=suggestions('interests','interestSuggestions',['音乐','电影','运动','游戏','旅行','阅读','绘画','舞蹈','科技','时尚','美食','宠物','露营']);
 const portrait=id=>'./assets/model-'+id+'.png',steps=[...document.querySelectorAll('[data-step]')];
 function readProfile(){return {mbti:$('mbti').value,skills:TeamupProfile.parseTags($('skills').value),interests:TeamupProfile.parseTags($('interests').value),bio:$('message').value.trim(),appearance,status:$('teamStatus').value}}
 function profileList(name,p){const status={looking:'正在找队友',joined:'已加入团队',full:'团队已满员'};const list=document.createElement('dl');for(const [key,value] of [['昵称',name],['MBTI',p.mbti],['组队状态',status[p.status]||status.looking],['技能',p.skills.join('、')],['兴趣',p.interests.join('、')],['自我介绍',p.bio]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;list.append(dt,dd)}return list}
 function renderPreview(){const p=readProfile();$('entryPortrait').src=portrait(appearance);$('previewProfile').replaceChildren(profileList($('name').value.trim(),p))}
 function setStep(n){step=n;for(const panel of steps)panel.hidden=Number(panel.dataset.step)!==n;$('stepLabel').textContent=['','01 / 03 · 个人资料','02 / 03 · 选择角色','03 / 03 · 预览入场'][n];$('backStep').hidden=n===1;$('nextStep').hidden=n===3;$('send').hidden=n!==3;$('nextStep').textContent=n===1?'下一步：选择角色 ↗':'下一步：预览名片 ↗';if(n===3)renderPreview();window.scrollTo({top:0,behavior:'auto'})}
 function setAppearance(id){appearance=id;$('characterPreview').src=portrait(id);$('characterPreviewLabel').textContent='角色 '+id.slice(-2)+' / '+TeamupProfile.appearances.length;for(const button of $('characterChoices').children)button.setAttribute('aria-checked',String(button.dataset.id===id))}
 for(const [index,id] of TeamupProfile.appearances.entries()){const i=index+1,button=document.createElement('button'),img=document.createElement('img');button.type='button';button.dataset.id=id;button.setAttribute('role','radio');button.setAttribute('aria-label','选择角色 '+String(i).padStart(2,'0'));img.src=portrait(id);img.alt='';img.loading='lazy';img.decoding='async';button.append(img);button.onclick=()=>setAppearance(id);$('characterChoices').append(button)}setAppearance(appearance);
 $('backStep').onclick=()=>setStep(step-1);$('nextStep').onclick=()=>{if(step===1&&fields.map(validate).includes(false)){$('messageForm').reportValidity();return}setStep(step+1)};
 function saveOwner(data){owner=data;try{localStorage.setItem(storageKey,JSON.stringify(data));return true}catch{return false}}
 function editUrl(data){return location.origin+location.pathname+'#edit='+data.id+'.'+data.token}
 function showSuccess(name,p){$('submittedProfile').replaceChildren(profileList(name,p));const url=new URL('./',location.href);url.searchParams.set('member',owner.id);$('viewMine').href=url.href+'#member-'+owner.id;$('meetOthers').href=url.href+'#messages';$('privateEditLink').value=editUrl(owner);$('messageForm').hidden=true;$('success').hidden=false;$('success').focus()}
 $('copyEditLink').onclick=async()=>{try{await navigator.clipboard.writeText($('privateEditLink').value);$('copyEditLink').textContent='已复制，妥善保存'}catch{$('privateEditLink').focus();$('privateEditLink').select();$('copyEditLink').textContent='请长按复制上方链接'}};
 $('editMine').onclick=()=>{$('success').hidden=true;$('messageForm').hidden=false;$('publicConsent').checked=false;setStep(1)};
 async function restoreOwner(){if(!db)return;let saved;const hash=location.hash.match(/^#edit=([0-9a-f-]{36})\.([0-9a-f]{64})$/i);if(hash){saved={id:hash[1],token:hash[2]}}else{try{saved=JSON.parse(localStorage.getItem(storageKey)||'null')}catch{}}
  if(!saved||!/^[0-9a-f-]{36}$/i.test(saved.id)||!/^[0-9a-f]{64}$/.test(saved.token))return;
  try{const verified=await db.rpc('teamup_verify_profile',{p_id:saved.id,p_token:saved.token});if(verified.error||verified.data!==true){$('formStatus').textContent='私人编辑链接无效或暂时无法验证，请稍后重试。';return}const {data,error}=await db.from('messages').select('name,message').eq('id',saved.id).maybeSingle();if(error||!data)return;const p=TeamupProfile.decode(data.message);if(!p.structured||!p.appearance)return;const stored=saveOwner(saved);if(hash&&stored)history.replaceState(null,'',location.pathname+location.search);$('name').value=data.name;$('mbti').value=p.mbti;$('teamStatus').value=p.status;$('skills').value=p.skills.join('、');$('interests').value=p.interests.join('、');$('message').value=p.bio;$('charCount').textContent=p.bio.length;syncSkills();syncInterests();setAppearance(p.appearance);showSuccess(data.name,p)}catch{$('formStatus').textContent='暂时无法验证私人链接，请保持链接并稍后重试。'}
 }void restoreOwner();
 $('message').addEventListener('input',()=>{$('charCount').textContent=$('message').value.length});
 $('messageForm').addEventListener('submit',async event=>{
  event.preventDefault();if(sending||!db)return;if(step!==3){$('nextStep').click();return}if(!$('publicConsent').checked){$('formStatus').textContent='请先确认同意公开展示。';$('publicConsent').focus();return}
  if(fields.map(validate).includes(false)){setStep(1);$('messageForm').reportValidity();return}const name=$('name').value.trim(),profile=readProfile();let message;
  try{message=TeamupProfile.encode(profile)}catch(error){$('formStatus').textContent=error.message;$('formStatus').classList.add('error');return}
  if(!pending||pending.name!==name||pending.message!==message){const data=owner||{id:crypto.randomUUID(),token:Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('')};pending={...data,name,message,editing:!!owner}}
  sending=true;$('send').disabled=true;$('send').textContent='正在提交…';$('formStatus').classList.remove('error');$('formStatus').textContent='';
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{const {error}=await db.rpc(pending.editing?'teamup_update_profile':'teamup_create_profile',{p_id:pending.id,p_token:pending.token,p_name:name,p_message:message}).abortSignal(controller.signal);if(error)throw error;saveOwner({id:pending.id,token:pending.token});pending=null;showSuccess(name,profile)}
  catch(error){$('formStatus').textContent=Teamup.error(error);$('formStatus').classList.add('error')}
  finally{clearTimeout(timeout);sending=false;$('send').disabled=false;$('send').textContent='确认并进入广场 ↗'}
 });
 $('another').onclick=()=>{pending=null;owner=null;try{localStorage.removeItem(storageKey)}catch{}$('messageForm').reset();for(const id of fields){$(id).setCustomValidity('');$(id).removeAttribute('aria-invalid');$(id+'Error').textContent=''}syncSkills();syncInterests();$('charCount').textContent='0';setAppearance('choice-01');$('success').hidden=true;$('messageForm').hidden=false;setStep(1);$('name').focus()};
})();
