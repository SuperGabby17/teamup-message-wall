(() => {
  const $ = id => document.getElementById(id);let db, sending = false, pending;
  try {db = Teamup.client();} catch (error) {$('formStatus').textContent = error.message;$('formStatus').classList.add('error');$('send').disabled = true;}
  $('message').addEventListener('input', () => {$('charCount').textContent = $('message').value.length;});
  $('messageForm').addEventListener('submit', async event => {
    event.preventDefault();if (sending || !db || !$('messageForm').reportValidity()) return;
    const name = $('name').value.trim(),message = $('message').value.trim();
    if (!name || !message) {$('formStatus').textContent = '姓名和留言都不能为空或只有空格。';$('formStatus').classList.add('error');(!name?$('name'):$('message')).focus();return;}
    if (!pending || pending.name !== name || pending.message !== message) pending = {id:crypto.randomUUID(),name,message};
    sending = true;$('send').disabled = true;$('send').textContent = '正在提交…';$('formStatus').classList.remove('error');$('formStatus').textContent = '';
    try {
      const {error} = await db.from('messages').insert(pending);
      if (error) {
        // A retry after a lost acknowledgement must not create a second message.
        if (error.code !== '23505') throw error;
        const result = await db.from('messages').select('id,name,message').eq('id',pending.id).maybeSingle();
        if (result.error || result.data?.name !== pending.name || result.data?.message !== pending.message) throw error;
      }
      $('messageForm').hidden = true;$('success').hidden = false;$('success').focus();
    } catch (error) {$('formStatus').textContent = Teamup.error(error);$('formStatus').classList.add('error');}
    finally {sending = false;$('send').disabled = false;$('send').textContent = '提交留言 ↗';}
  });
  $('another').onclick = () => {pending = null;$('messageForm').reset();$('charCount').textContent = '0';$('success').hidden = true;$('messageForm').hidden = false;$('name').focus();};
})();
