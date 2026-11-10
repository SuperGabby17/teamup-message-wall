(() => {
 const el=id=>document.getElementById(id), statusLabels={pending:'等待对方回应',accepted:'已接受',declined:'已拒绝'};
 const ownerKey='teamup-private-profile-v2'; let owner=null,db=null,invites=[],eligible=new Set(),busy=false;
 const note=el('inviteStatus'),list=el('inviteList');
 function node(tag,text,cls){const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e}
 function errText(error){if(error?.code==='23505')return '双方已有等待回应的邀请。';return '操作未完成，请检查网络后重试。'}
 function profileName(id){const card=document.getElementById('member-'+id);return card?.querySelector('h3')?.textContent||'一位伙伴'}
 function refreshButtons(){for(const card of el('messages').querySelectorAll('.message-card')){
  const id=card.id.replace(/^member-/,'');let btn=card.querySelector('.invite-action');if(!btn){btn=node('button','','invite-action');btn.type='button';card.append(btn)}
  btn.dataset.target=id;const open=invites.find(i=>i.status==='pending'&&((i.sender===owner?.id&&i.recipient===id)||(i.sender===id&&i.recipient===owner?.id)));
  if(!owner||!db){btn.hidden=true;continue}btn.hidden=false;btn.disabled=id===owner.id||!eligible.has(id)||!!open;
  btn.textContent=id===owner.id?'这是我的名片':!eligible.has(id)?'暂不能接收邀请':open?(open.sender===owner.id?'已邀请 · 等待回应':'已收到对方邀请'):'邀请组队 ↗';
 }}
 function render(){list.replaceChildren();const inbox=invites.filter(x=>x.recipient===owner?.id&&x.status==='pending');const rest=invites.filter(x=>!inbox.includes(x));
  if(!invites.length)list.append(node('p','还没有邀请。浏览下方伙伴，选择“邀请组队”。','invite-empty'));
  for(const i of [...inbox,...rest]){const card=node('article',null,'invite-item'),incoming=i.recipient===owner.id,who=profileName(incoming?i.sender:i.recipient);
   card.append(node('strong',incoming?who+' 邀请你组队':'你邀请了 '+who));card.append(node('span',statusLabels[i.status]||i.status,'invite-result'));
   if(incoming&&i.status==='pending'){const actions=node('div',null,'invite-actions');for(const [label,response] of [['接受','accepted'],['拒绝','declined']]){const b=node('button',label,'invite-response');b.type='button';b.dataset.id=i.id;b.dataset.response=response;actions.append(b)}card.append(actions)}list.append(card)}refreshButtons();
 }
 async function getState(){if(!db||!owner||busy)return;busy=true;try{const [a,b]=await Promise.all([db.rpc('teamup_my_invitations',{p_profile:owner.id}),db.rpc('teamup_invitable_profiles')]);if(a.error)throw a.error;if(b.error)throw b.error;invites=a.data||[];eligible=new Set((b.data||[]).map(x=>x.profile_id));note.textContent='你的邀请仅本人可处理';render()}catch(e){note.textContent=errText(e)}finally{busy=false}}
 async function start(){try{owner=JSON.parse(localStorage.getItem(ownerKey)||'null')}catch{};if(!owner?.id||!owner?.token){note.textContent='请先在本机创建名片，或打开保存的私人编辑链接后返回此页。';return}
  try{const cfg=window.APP_CONFIG;db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'teamup-invitation-auth-v1'}});let {data:{session},error}=await db.auth.getSession();if(error)throw error;if(!session){const r=await db.auth.signInAnonymously();if(r.error)throw r.error;session=r.data.session}if(!session)throw Error('No session');const claimed=await db.rpc('teamup_claim_identity',{p_id:owner.id,p_token:owner.token});if(claimed.error)throw claimed.error;await getState()}
  catch{db=null;note.textContent='暂时无法验证你的身份，请从私人编辑链接进入后重试。'}
 }
 el('messages').addEventListener('click',async e=>{const b=e.target.closest('.invite-action');if(!b||b.disabled||!db)return;b.disabled=true;const r=await db.rpc('teamup_send_invitation',{p_from:owner.id,p_to:b.dataset.target});if(r.error){note.textContent=errText(r.error);b.disabled=false;return}note.textContent='邀请已发送，等待对方回应。';await getState()});
 list.addEventListener('click',async e=>{const b=e.target.closest('.invite-response');if(!b||b.disabled||!db)return;for(const x of b.parentElement.children)x.disabled=true;const r=await db.rpc('teamup_respond_invitation',{p_profile:owner.id,p_invitation:b.dataset.id,p_response:b.dataset.response});if(r.error){note.textContent=errText(r.error);for(const x of b.parentElement.children)x.disabled=false;return}note.textContent=b.dataset.response==='accepted'?'已接受邀请。':'已拒绝邀请。';await getState()});
 document.addEventListener('teamup:wall-updated',()=>{if(db)render()});document.addEventListener('visibilitychange',()=>{if(!document.hidden)void getState()});setInterval(()=>{if(!document.hidden)void getState()},8000);void start();
})();
