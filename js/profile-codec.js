// Versioned profile records reuse messages.name/message, retaining existing RLS.
// Keep this file identical to the plaza's public/profile-codec.js.
(() => {
  const mbtis = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP','未测'];
  const appearances = Object.freeze(Array.from({length:18},(_,i)=>'choice-'+String(i+1).padStart(2,'0')));
  const prefix = '[TEAMUP:PROFILE:1]\n';
  const prefix2 = '[TEAMUP:PROFILE:2]\n';
  function parseTags(value) {
    const tags = [...new Set(String(value).split(/[,，、;；\n]+/).map(s=>s.trim()).filter(Boolean))];
    if (!tags.length || tags.length > 5) throw new Error('请填写 1–5 项，多个内容用逗号隔开。');
    if (tags.some(s=>s.length>12 || /[\r\n\x00-\x1f]/.test(s))) throw new Error('每一项最多 12 个字，请简短填写。');
    return tags;
  }
  function encode(profile) {
    if (!mbtis.includes(profile.mbti)) throw new Error('请选择 MBTI；不确定时可以选择「未测」。');
    const skills = parseTags(profile.skills.join('、')), interests = parseTags(profile.interests.join('、'));
    const bio = String(profile.bio).trim();
    if (!bio || bio.length>300) throw new Error('请填写 1–300 字的自我介绍。');
    if(!appearances.includes(profile.appearance)) throw new Error('请选择人物形象。');
    const status=['looking','joined','full'].includes(profile.status)?profile.status:'looking';
    const text = prefix2+JSON.stringify({m:profile.mbti,s:skills,i:interests,b:bio,a:profile.appearance,t:status});
    if (text.length>500) throw new Error('资料过长，请缩短技能或兴趣标签。');
    return text;
  }
  function decode(message) {
    const text = typeof message==='string'?message:'';
    const legacy = {mbti:'',skills:[],interests:[],bio:text,structured:false};
    if(text.startsWith(prefix2)){
      try{const p=JSON.parse(text.slice(prefix2.length));if(!mbtis.includes(p.m)||!appearances.includes(p.a)||typeof p.b!=='string'||!p.b.trim()||p.b.length>300)return legacy;
       return {mbti:p.m,skills:parseTags(p.s.join('、')),interests:parseTags(p.i.join('、')),bio:p.b,appearance:p.a,status:['looking','joined','full'].includes(p.t)?p.t:'looking',structured:true};}catch{return legacy;}
    }
    if (!text.startsWith(prefix)) return legacy;
    const match = /^MBTI: ([^\n]+)\n技能: ([^\n]+)\n兴趣: ([^\n]+)\n自我介绍:\n([\s\S]+)$/.exec(text.slice(prefix.length));
    if (!match || !mbtis.includes(match[1]) || !match[4].trim() || match[4].length>300) return legacy;
    try {return {mbti:match[1],skills:parseTags(match[2]),interests:parseTags(match[3]),bio:match[4],structured:true};}
    catch {return legacy;}
  }
  globalThis.TeamupProfile = Object.freeze({mbtis,appearances,parseTags,encode,decode});
})();
