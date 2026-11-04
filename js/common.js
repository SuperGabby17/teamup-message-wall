(() => {
  let client;
  window.Teamup = {
    client() {
      if (client) return client;
      const config = window.APP_CONFIG || {};
      if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) throw new Error('网站尚未连接数据库：请管理员填写 config.js 中的 Supabase URL 和 anon key。');
      const url = new URL(config.SUPABASE_URL);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Supabase URL 必须是有效的 HTTPS 项目地址。');
      const key = config.SUPABASE_ANON_KEY.trim();
      if (key.startsWith('sb_secret_')) throw new Error('请使用公开的 anon / publishable key，不能使用 secret key。');
      if (key.split('.').length === 3) {
        try { const body = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); if (JSON.parse(atob(body)).role !== 'anon') throw new Error('wrong_role'); }
        catch { throw new Error('请使用 Supabase anon 公钥，不能使用 service_role key。'); }
      } else if (!key.startsWith('sb_publishable_')) throw new Error('请检查 Supabase anon / publishable key 是否完整。');
      if (!window.supabase?.createClient) throw new Error('数据库组件加载失败，请刷新页面。');
      client = window.supabase.createClient(url.origin, key, {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}});
      return client;
    },
    error(error) {
      if (error?.code === '42501') return '数据库权限尚未配置，请管理员运行 supabase/schema.sql。';
      if (error?.code === '42P01' || error?.code === 'PGRST205') return '留言表尚未建立，请管理员运行 supabase/schema.sql。';
      if (error?.code === '23514') return '资料长度不符合要求，请检查后重试。';
      if (!navigator.onLine) return '网络已断开，恢复连接后可重试。';
      return '暂时无法连接留言服务，请稍后重试；填写内容已保留。';
    }
  };
})();
