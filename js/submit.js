(() => {
  const $ = id => document.getElementById(id);let db, sending = false, pending;
  try {db = Teamup.client();} catch (error) {$('formStatus').textContent = error.message;$('formStatus').classList.add('error');$('send').disabled = true;}
  const fields=['name','mbti','skills','interests','message'];
  for(const mbti of TeamupProfile.mbtis){const option=document.createElement('option');option.value=mbti;option.textContent=mbti==='未测'?'还没测／不确定':mbti;$('mbti').append(option);}
  function validate(id){
    const input=$(id);let error='';
    if(!input.value.trim())error=({name:'请填写你的昵称。',mbti:'请选择 MBTI，或选择「还没测／不确定」。',message:'请写一段自我介绍。'})[id]||'请至少填写一项。';
    else if(id==='skills'||id==='interests'){try{TeamupProfile.parseTags(input.value);}catch(e){error=e.message;}}
    input.setCustomValidity(error);input.setAttribute('aria-invalid',String(!!error));$(id+'Error').textContent=error;return !error;
  }
  for(const id of fields){$(id).addEventListener('blur',()=>validate(id));$(id).addEventListener('input',()=>{if($(id).getAttribute('aria-invalid')==='true')validate(id);$('formStatus').textContent='';});}
  $('mbti').addEventListener('change',()=>validate('mbti'));
  function suggestions(id,container,values){
    const sync=()=>{const selected=$(id).value.split(/[,，、;；\n]+/).map(s=>s.trim());for(const b of $(container).children)b.setAttribute('aria-pressed',String(selected.includes(b.textContent)));};
    for(const value of values){const button=document.createElement('button');button.type='button';button.textContent=value;button.setAttribute('aria-pressed','false');button.onclick=()=>{
      let tags=[...new Set($(id).value.split(/[,，、;；\n]+/).map(s=>s.trim()).filter(Boolean))];
      if(tags.includes(value))tags=tags.filter(s=>s!==value);
      else if(tags.length>=5){$(id+'Error').textContent='最多选择 5 项，请先取消一项。';return;}
      else tags.push(value);
      $(id).value=tags.join('、');sync();validate(id);
    };$(container).append(button);}
    $(id).addEventListener('input',sync);return sync;
  }
  const syncSkills=suggestions('skills','skillSuggestions',['视觉设计','编程','摄影','文案','剪辑','策划','UI设计','产品设计','交互设计','活动策划','工程开发','AI应用','数据分析']);
  const syncInterests=suggestions('interests','interestSuggestions',['音乐','电影','运动','游戏','旅行','阅读','绘画','舞蹈','科技','时尚','美食','宠物','露营']);
  $('message').addEventListener('input', () => {$('charCount').textContent = $('message').value.length;});
  $('messageForm').addEventListener('submit', async event => {
    event.preventDefault();if (sending || !db) return;
    const valid=fields.map(validate);if(valid.includes(false)){$('messageForm').reportValidity();return;}
    const name = $('name').value.trim();
    const profile={mbti:$('mbti').value,skills:TeamupProfile.parseTags($('skills').value),interests:TeamupProfile.parseTags($('interests').value),bio:$('message').value.trim()};
    let message;try{message=TeamupProfile.encode(profile);}catch(error){$('formStatus').textContent=error.message;$('formStatus').classList.add('error');return;}
    if (!pending || pending.name !== name || pending.message !== message) pending = {id:crypto.randomUUID(),name,message};
    sending = true;$('send').disabled = true;$('send').textContent = '正在提交…';$('formStatus').classList.remove('error');$('formStatus').textContent = '';
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try {
      const {error} = await db.from('messages').insert(pending).abortSignal(controller.signal);
      if (error) {
        // A retry after a lost acknowledgement must not create a second message.
        if (error.code !== '23505') throw error;
        const result = await db.from('messages').select('id,name,message').eq('id',pending.id).maybeSingle().abortSignal(controller.signal);
        if (result.error || result.data?.name !== pending.name || result.data?.message !== pending.message) throw error;
      }
      const summary=document.createElement('dl');
      for(const [label,value] of [['昵称',name],['MBTI',profile.mbti],['技能',profile.skills.join('、')],['兴趣',profile.interests.join('、')],['自我介绍',profile.bio]]){const term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=label;detail.textContent=value;summary.append(term,detail);}
      $('submittedProfile').replaceChildren(summary);$('messageForm').hidden = true;$('success').hidden = false;$('success').focus();
    } catch (error) {$('formStatus').textContent = Teamup.error(error);$('formStatus').classList.add('error');}
    finally {clearTimeout(timeout);sending = false;$('send').disabled = false;$('send').textContent = '提交我的名片 ↗';}
  });
  $('another').onclick = () => {pending = null;$('messageForm').reset();for(const id of fields){$(id).setCustomValidity('');$(id).removeAttribute('aria-invalid');$(id+'Error').textContent='';}syncSkills();syncInterests();$('charCount').textContent = '0';$('success').hidden = true;$('messageForm').hidden = false;$('name').focus();};
})();
