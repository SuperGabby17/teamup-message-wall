(() => {
  const $ = id => document.getElementById(id);
  // Relative resolution preserves /repository/ when hosted on GitHub project Pages.
  const submitURL = new URL('submit.html', location.href);
  $('submitLink').href = $('qrLink').href = submitURL.href;
  try { new QRCode($('qrcode'), {text: submitURL.href, width: 224, height: 224, colorDark: '#10170e', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M}); }
  catch { $('qrcode').textContent = '二维码生成失败，请使用填写链接。'; }
  $('copyLink').onclick = async () => {try {await navigator.clipboard.writeText(submitURL.href);$('copyStatus').textContent = '填写链接已复制';} catch {$('copyStatus').textContent = '请长按或右键上方二维码，复制链接。';}};
  const entries = new Map(); let db, channel, syncing = false, resync = false, live = false;
  const date = new Intl.DateTimeFormat('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
  const state = (kind, text) => {$('connection').dataset.state = kind;$('connection').querySelector('span').textContent = text;};
  function merge(rows) {
    let added = 0;
    for (const row of rows) if (row?.id && typeof row.name === 'string' && typeof row.message === 'string' && !entries.has(row.id)) {
      const card = document.createElement('article');card.className = 'message-card';card.setAttribute('role','listitem');
      const top = document.createElement('div');top.className = 'card-top';
      const avatar = document.createElement('span');avatar.className = 'avatar';avatar.setAttribute('aria-hidden','true');avatar.textContent = Array.from(row.name)[0] || '·';
      const name = document.createElement('h3');name.textContent = row.name;
      const message = document.createElement('p');message.textContent = row.message;
      const time = document.createElement('time');const parsed = new Date(row.created_at);if (!Number.isNaN(parsed.valueOf())) {time.dateTime = parsed.toISOString();time.textContent = date.format(parsed);}
      top.append(avatar,name);card.append(top,message,time);entries.set(row.id,{row,card});added++;
    }
    if (added) {
      const sorted = [...entries.values()].sort((a,b) => a.row.created_at.localeCompare(b.row.created_at) || a.row.id.localeCompare(b.row.id));
      $('messages').replaceChildren(...sorted.map(item => item.card));$('messageCount').textContent = String(entries.size).padStart(2,'0');
      $('announcement').textContent = `已显示 ${entries.size} 条留言`;
      $('wallNotice').hidden = true;
    }
  }
  async function refresh() {
    if (!db) return;
    if (syncing) {resync = true;return;} syncing = true;
    try {
      // Page through every row instead of silently stopping at PostgREST's row limit.
      for (let from = 0; ; from += 500) {
        const {data,error} = await db.from('messages').select('id,name,message,created_at').order('created_at',{ascending:true}).order('id',{ascending:true}).range(from,from+499);
        if (error) throw error;merge(data || []);if (!data || data.length < 500) break;
      }
      $('retry').hidden = true;$('wallNotice').classList.remove('error');$('wallNotice').hidden = entries.size > 0;
      if (!entries.size) $('wallNotice').textContent = '还没有留言。扫码，成为第一个打招呼的人。';
      if (!live) state('loading','留言已更新 · 正在连接实时服务');
    } catch (error) {$('wallNotice').hidden = false;$('wallNotice').classList.add('error');$('wallNotice').textContent = Teamup.error(error);$('retry').hidden = false;state('error','连接异常');}
    finally {syncing = false;if (resync) {resync = false;void refresh();}}
  }
  function start() {
    try {db = Teamup.client();}
    catch (error) {$('wallNotice').textContent = error.message;$('wallNotice').classList.add('error');state('error','尚未连接');return;}
    if (channel) db.removeChannel(channel);
    channel = db.channel('teamup-public-messages').on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'}, payload => merge([payload.new])).subscribe(status => {
      live = status === 'SUBSCRIBED';
      if (live) {state('live','实时连接');void refresh();}
      else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) {state('error','实时重连中 · 定时补读');$('retry').hidden = false;}
    });
    void refresh();
  }
  $('retry').onclick = () => {state('loading','重新连接…');start();};
  // Catch up after sleep/network loss, and keep useful data even if WebSockets fail.
  setInterval(() => {if (!document.hidden) void refresh();}, 15000);
  document.addEventListener('visibilitychange', () => {if (!document.hidden) void refresh();});
  window.addEventListener('online', () => {void refresh();});
  window.addEventListener('offline', () => {live = false;state('error','网络已断开');});
  start();
})();
