const FB = {
  apiKey:            "AIzaSyBgppLaWv-3M9IsCzUtDD5Z8pqUxPtdPLk",
  authDomain:        "liquidtipe.firebaseapp.com",
  projectId:         "liquidtipe",
  storageBucket:     "liquidtipe.firebasestorage.app",
  messagingSenderId: "765092878295",
  appId:             "1:765092878295:web:e63bf4df58cee3141d5d92"
};


let db, FB_READY = false;
function initFB() {
  if (FB.projectId === 'YOUR_PROJECT_ID') { document.getElementById('setup-banner').style.display='block'; return false; }
  try { firebase.initializeApp(FB); db = firebase.firestore(); FB_READY = true; return true; }
  catch(e) { console.error('Firebase failed:',e); return false; }
}


function getU() { return localStorage.getItem('lt_u') || null; }
function setU(u) { u ? localStorage.setItem('lt_u',u) : localStorage.removeItem('lt_u'); }
let UC = null; // user cache

// ── DATA LAYER ─────────────────────────────────────────
async function dbGetUser(u) {
  if (FB_READY) { const d=await db.collection('users').doc(u).get(); return d.exists?d.data():null; }
  return (JSON.parse(localStorage.getItem('lt_accs')||'[]')).find(a=>a.username===u)||null;
}
async function dbAllUsers() {
  if (FB_READY) { const s=await db.collection('users').get(); return s.docs.map(d=>d.data()); }
  return JSON.parse(localStorage.getItem('lt_accs')||'[]');
}
async function dbCreateUser(data) {
  if (FB_READY) { await db.collection('users').doc(data.username).set(data); return; }
  const a=JSON.parse(localStorage.getItem('lt_accs')||'[]'); a.push(data); localStorage.setItem('lt_accs',JSON.stringify(a));
}
async function dbUpdateUser(u, ch) {
  if (FB_READY) { await db.collection('users').doc(u).update(ch); }
  else { const a=JSON.parse(localStorage.getItem('lt_accs')||'[]'),i=a.findIndex(x=>x.username===u); if(i>=0){Object.assign(a[i],ch);localStorage.setItem('lt_accs',JSON.stringify(a));} }
  if (u===getU()&&UC) Object.assign(UC,ch);
}
async function dbDeleteUser(u) {
  if (FB_READY) { await db.collection('users').doc(u).delete(); return; }
  const a=JSON.parse(localStorage.getItem('lt_accs')||'[]').filter(x=>x.username!==u); localStorage.setItem('lt_accs',JSON.stringify(a));
}

// chat
let chatCache=[], chatUnsub=null;
function startChatListener() {
  if (chatUnsub) try{chatUnsub();}catch(e){clearInterval(chatUnsub);}
  if (FB_READY) {
    chatUnsub = db.collection('messages').orderBy('ts').limitToLast(150).onSnapshot(s=>{
      const prevLen=chatCache.length;chatCache=s.docs.map(d=>d.data());if(window._modPingEnabled&&chatCache.length>prevLen&&prevLen>0){try{const a=new AudioContext();const o=a.createOscillator();const g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=880;g.gain.setValueAtTime(0.1,a.currentTime);g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+0.15);o.start();o.stop(a.currentTime+0.15);}catch(e){}} renderChat();
      if(admOpen)renderAdmChat(); if(dpOpen)renderDPChat();
    });
  } else {
    const poll=()=>{chatCache=JSON.parse(localStorage.getItem('lt_chat')||'[]');renderChat();};
    poll(); chatUnsub=setInterval(poll,2500);
  }
}
async function dbAddMsg(m) {
  if (FB_READY) { await db.collection('messages').doc(m.id).set(m); return; }
  const c=JSON.parse(localStorage.getItem('lt_chat')||'[]'); c.push(m); if(c.length>200)c.splice(0,c.length-200); localStorage.setItem('lt_chat',JSON.stringify(c)); chatCache=c; renderChat();
}
async function dbDelMsg(id) {
  const _delMsg=chatCache.find(x=>x.id===id); if(_delMsg)venTypeTrackDelete(id,_delMsg.text);
  if (FB_READY) { await db.collection('messages').doc(id).delete(); return; }
  chatCache=chatCache.filter(m=>m.id!==id); localStorage.setItem('lt_chat',JSON.stringify(chatCache)); renderChat(); if(admOpen)renderAdmChat(); if(dpOpen)renderDPChat();
}
async function dbEditMsg(id, newText) {
  const _oldMsg=chatCache.find(x=>x.id===id); if(_oldMsg)venTypeTrackEdit(id,_oldMsg.text);
  if (FB_READY) { await db.collection('messages').doc(id).update({text:newText,edited:true}); return; }
  const m=chatCache.find(x=>x.id===id); if(m){m.text=newText;m.edited=true;} localStorage.setItem('lt_chat',JSON.stringify(chatCache)); renderChat(); if(admOpen)renderAdmChat(); if(dpOpen)renderDPChat();
}

// ── STREAK HELPER ─────────────────────────────────────
function todayStr(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function yesterdayStr(){const d=new Date();d.setDate(d.getDate()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function calcStreak(acc){
  const today=todayStr(), yesterday=yesterdayStr();
  const last=acc.lastLoginDate||'';
  if(last===today) return {streak:acc.streak||1,lastLoginDate:today};
  if(last===yesterday) return {streak:(acc.streak||0)+1,lastLoginDate:today};
  return {streak:1,lastLoginDate:today};
}

// ── AUTH ───────────────────────────────────────────────
function switchAuth(tab) {
  document.getElementById('tab-li').classList.toggle('on',tab==='login');
  document.getElementById('tab-re').classList.toggle('on',tab==='register');
  document.getElementById('li-form').style.display=tab==='login'?'':'none';
  document.getElementById('re-form').style.display=tab==='register'?'':'none';
}
async function doLogin() {
  const u=document.getElementById('li-u').value.trim(), p=document.getElementById('li-p').value;
  const msg=document.getElementById('li-msg'), btn=document.getElementById('li-btn');
  if(!u||!p){msg.className='amsg err';msg.textContent='Fill in all fields.';return;}
  btn.disabled=true; btn.textContent='Checking…';
  const acc=await dbGetUser(u);
  if(!acc||acc.password!==p){msg.className='amsg err';msg.textContent='Wrong username or password.';btn.disabled=false;btn.textContent='Login';return;}
  const streakData=calcStreak(acc);
  await dbUpdateUser(u,streakData);
  UC={...acc,...streakData}; setU(u); msg.className='amsg ok'; msg.textContent='Welcome back!'; setTimeout(enterApp,300);
}
async function doRegister() {
  const u=document.getElementById('re-u').value.trim(), p=document.getElementById('re-p').value;
  const msg=document.getElementById('re-msg'), btn=document.getElementById('re-btn');
  if(!u||!p){msg.className='amsg err';msg.textContent='Fill in all fields.';return;}
  if(u.length<3){msg.className='amsg err';msg.textContent='Username must be 3+ chars.';return;}
  if(p.length<4){msg.className='amsg err';msg.textContent='Password must be 4+ chars.';return;}
  btn.disabled=true; btn.textContent='Checking…';
  if(await dbGetUser(u)){msg.className='amsg err';msg.textContent='Username taken.';btn.disabled=false;btn.textContent='Create Account';return;}
  const acc={username:u,password:p,coins:100,themes:['default'],activeTheme:'default',gradientColors:null,streak:1,lastLoginDate:todayStr()};
  await dbCreateUser(acc); UC={...acc}; setU(u); msg.className='amsg ok'; msg.textContent='Account created!'; setTimeout(enterApp,300);
}
function doLogout() {
  setU(null); UC=null; liveCleanup();
  if(chatUnsub)try{chatUnsub();}catch(e){clearInterval(chatUnsub);}chatUnsub=null;
  if(dmListUnsub)try{dmListUnsub();}catch(e){}dmListUnsub=null;
  if(dmConvoUnsub)try{dmConvoUnsub();}catch(e){}dmConvoUnsub=null;
  activeDMId=null; dmCache={};
  document.getElementById('app').style.display='none';
  document.getElementById('auth').style.display='none';
  showWelcomeScreen();
  document.getElementById('li-btn').disabled=false; document.getElementById('li-btn').textContent='Login';
  document.getElementById('re-btn').disabled=false; document.getElementById('re-btn').textContent='Create Account';
  document.getElementById('li-msg').textContent='';
  resetRace(); applyTheme('default',null);
}
function enterApp() {
  document.getElementById('auth').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('nav-user').textContent=UC.username;
  refreshCoins(); applyTheme(UC.activeTheme||'default',UC.gradientColors||null);
  goTab('home');
  renderShop(); startChatListener(); renderLB(); startDMListener(); loadBannedWords(); checkTrollNotif(); applyActiveTrollEffects(); startTrollEffectWatcher();
  loadDPThemesIntoShop().then(()=>{if(UC&&UC.activeTheme&&UC.activeTheme.startsWith("dp_"))applyDPTheme(UC.activeTheme);});
  if(UC.activeMods&&UC.activeMods.length){activeMods=new Set(UC.activeMods);applyAllMods();}
  setTimeout(async()=>{await checkAndGrantSecretThemes(0);await checkBadges({streak:UC.streak||1});},1500);
}

// ── NAV ────────────────────────────────────────────────
function goTab(id) {
  document.querySelectorAll('.ntab').forEach((t,i)=>t.classList.toggle('on',['home','race','shop','chat','lb','dm'][i]===id));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
  document.getElementById('tab-'+id).classList.add('on');
  if(id==='home') renderHome();
  if(id==='shop'){renderShop();}
  if(id==='chat')setTimeout(scrollMsgs,50);
  if(id==='lb')renderLB();
  if(id==='dm'){renderDMList();if(activeDMId)renderDMConvo(activeDMId);}
}
function refreshCoins() {
  const c=UC?(UC.coins||0):0;
  document.getElementById('coin-count').textContent=c;
  document.getElementById('shop-coins').textContent=c;
}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function esca(s){return String(s).replace(/'/g,"\\'")}

async function renderHome() {
  if(!UC) return;
  document.getElementById('home-user').textContent = UC.username;
  document.getElementById('h-coins').textContent = UC.coins || 0;
  document.getElementById('h-streak').textContent = UC.streak || 1;
  document.getElementById('h-wpm').textContent = UC.maxWpm || 0;
  document.getElementById('h-themes').textContent = (UC.themes || []).length;

  const newsEl = document.getElementById('home-news-list');
  await loadUpdateLog();
  if(updateLogCache.length > 0) {
    const latest = updateLogCache[0];
    newsEl.innerHTML = `
      <div class="home-news-item">
        <div class="h-news-ver">Version ${esc(latest.version)}</div>
        <ul class="h-news-changes">
          ${latest.changes.slice(0, 3).map(c => `<li>${esc(c)}</li>`).join('')}
          ${latest.changes.length > 3 ? '<li>...and more</li>' : ''}
        </ul>
      </div>
    `;
  } else {
    newsEl.innerHTML = '<div class="empty">No news yet.</div>';
  }
}

// ── SOLO RACE ENGINE ────────────────────────────────────
const DEPOULE_PROMPTS=[
  "Peed is a perfect combination!",
  "FREEDOM!!!!!",
  "I-- i- uhh i uhh- fogo- my lin- plea-",
  "This is a long line of typing",
  "DOODLEHONEYOWNSTHESKY",
  "Im in the thick of it everybody knows, They know me where it snows I skate in and they froze.",
  "PEterful wrote these sentences!",
  "If scripting is your power then what are you without it?",
  "Freed or Jeed. Hmm idk dawg.",
  "The wind whispers Pancakes in my ears",
  "KNEEL KNEEEEL I SAID KNEEEEEEEEEEEELLLLLLLLLLLLLL KNEEEELLLLL KNEEEEEEEEEEEEEEEEEEEEEEEEEEEEL",
  "Depoule Depoule Depoule Depoule Depoule Depoule Depoule Depoule Depoule Depoule Depoule Depoule Depoule Depoule Depoule Depoule "
];
const NORMAL_PROMPTS=[
  "It just works, it just works! Little lies, stunning shows, People buy, money flows, it just works!",
  "I love random sentances lol.",
  `This random person said "these random words."`,
  "Accuracy? What's that? Ohh, that random number.",
  "These sentances aren't randomly generated like nitrotype.",
  "Typing is fun. Type this sentance for fun.",
  "I haven't finished my AR goal."
];
const BOT_NAMES=['Ytggobs','TheFinnyShow','Doodlehoney2018','Marco'];
const REWARDS_NORMAL=[40,25,10,5];
const REWARDS_DEPOULE=[75,50,25,10];
const PLABELS=['1ST','2ND','3RD','4TH'];
const PCSS=['p1','p2','p3','p4'];

let RS={active:false,prompt:'',typed:'',startTime:null,endTime:null,bots:[],botIvs:[],timerIv:null,finished:false,finishOrder:[],errors:0,mode:'solo',raceType:'normal'};
let lastLen=0;

function startSolo() {
  if(RS.active||liveRS.searching||liveRS.active)return;
  const type = document.getElementById('race-type-select').value;
  const diff = document.getElementById('race-diff-select').value;
  
  // Bot Speed Scaling
  let bMin, bRange;
  if(diff === 'easy') { bMin = 25; bRange = 15; }
  else if(diff === 'hard') { bMin = 80; bRange = 25; }
  else if(diff === 'expert') { bMin = 115; bRange = 35; }
  else { bMin = 45; bRange = 25; } // medium

  const promptPool = type === 'depoule' ? DEPOULE_PROMPTS : NORMAL_PROMPTS;
  
  RS={active:false,prompt:promptPool[Math.floor(Math.random()*promptPool.length)],typed:'',startTime:null,endTime:null,
    bots:BOT_NAMES.map(n=>({name:n,wpm:Math.floor(Math.random()*bRange)+bMin,progress:0,finished:false,finishTime:null,expectedMs:0})),
    botIvs:[],timerIv:null,finished:false,finishOrder:[],errors:0,mode:'solo',raceType:type};
  const wc=RS.prompt.trim().split(/\s+/).length;
  RS.bots.forEach(b=>b.expectedMs=(wc/b.wpm)*60000);
  renderPromptText(); renderRacers('solo');
  document.getElementById('result-box').style.display='none';
  document.getElementById('btn-solo').style.display='none';
  document.getElementById('btn-live').style.display='none';
  resetStats();
  countdown(()=>beginSolo());
}

function beginSolo() {
  RS.active=true; RS.startTime=Date.now();
  const inp=document.getElementById('tinput');
  inp.disabled=false; inp.value=''; lastLen=0; inp.focus();
  RS.botIvs=RS.bots.map((b,i)=>setInterval(()=>{
    if(!RS.active||b.finished)return;
    const elapsed=Date.now()-RS.startTime;
    b.progress=Math.min(1,elapsed/b.expectedMs);
    const pct=Math.round(b.progress*100);
    const bar=document.getElementById('bar-bot-'+i);
    if(bar){bar.style.width=pct+'%';const lbl=document.getElementById('bpct-'+i);if(lbl)lbl.textContent=pct+'%';}
    document.getElementById('bwpm-'+i).textContent=b.wpm+' wpm';
    if(b.progress>=1&&!b.finished){
      b.finished=true; b.finishTime=Date.now();
      RS.finishOrder.push({type:'bot',name:b.name,time:b.finishTime});
    }
  },100));
  RS.timerIv=setInterval(()=>{
    if(!RS.active)return;
    const e=(Date.now()-RS.startTime);
    document.getElementById('s-time').textContent=(e/1000).toFixed(1)+'s';
    const em=e/60000, words=RS.typed.trim().split(/\s+/).filter(Boolean).length;
    const wpm=em>0?Math.round(words/em):0;
    document.getElementById('s-wpm').textContent=wpm;
    document.getElementById('pwpm-you').textContent=wpm+' wpm';
  },200);
}

async function soloFinished() {
  RS.active=false; RS.finished=true; RS.endTime=Date.now();
  document.getElementById('tinput').disabled=true;
  RS.botIvs.forEach(id=>clearInterval(id)); clearInterval(RS.timerIv);
  RS.finishOrder.push({type:'player',time:RS.endTime});
  RS.bots.forEach((b,i)=>{
    if(!b.finished){
      // Bot hadn't finished yet — it finishes AFTER player
      b.finished=true;
      b.finishTime=RS.endTime+Math.floor(Math.random()*6000)+500;
      RS.finishOrder.push({type:'bot',name:b.name,time:b.finishTime});
      // Animate remaining bots to 100%
      const bar=document.getElementById('bar-bot-'+i);
      if(bar){bar.style.width='100%';const l=document.getElementById('bpct-'+i);if(l)l.textContent='100%';}
    }
  });
  RS.finishOrder.sort((a,b)=>a.time-b.time);
  const place=RS.finishOrder.findIndex(f=>f.type==='player')+1;
  const elapsed=RS.endTime-RS.startTime;
  const wpm=Math.round(RS.prompt.trim().split(/\s+/).length/(elapsed/60000));
  const acc=Math.max(0,Math.round(((RS.prompt.length-RS.errors)/RS.prompt.length)*100));
  const rewards = RS.raceType === 'depoule' ? REWARDS_DEPOULE : REWARDS_NORMAL;
  const baseCoins=rewards[Math.min(place-1,3)];
  const coins=Math.round(baseCoins * (acc / 100));
  if(UC){UC.coins=(UC.coins||0)+coins;await dbUpdateUser(getU(),{coins:UC.coins});refreshCoins();}
  await checkAndGrantSecretThemes(wpm);
  await checkBadges({wpm,place,isLive:false,firstRace:!(UC.badges||[]).includes('first_race')});
  if(place===1&&window._modConfettiWin)confettiBlast('#ffd700');
  showResult(place,coins,wpm,acc,elapsed);
}

function showResult(place,coins,wpm,acc,elapsed) {
  const el=document.getElementById('r-place');
  el.textContent=PLABELS[Math.min(place-1,3)]; el.className='rplace '+PCSS[Math.min(place-1,3)];
  document.getElementById('r-coins').textContent='+'+coins+' 🧢';
  document.getElementById('r-wpm').textContent=wpm;
  document.getElementById('r-acc').textContent=acc+'%';
  document.getElementById('r-time').textContent=(elapsed/1000).toFixed(1)+'s';
  document.getElementById('result-box').style.display='block';
  document.getElementById('btn-solo').style.display='';
  document.getElementById('btn-live').style.display='';
}

function resetRace() {
  RS.active=false; RS.finished=false;
  RS.botIvs.forEach(id=>clearInterval(id)); clearInterval(RS.timerIv);
  liveCleanup();
  document.getElementById('tinput').disabled=true; document.getElementById('tinput').value='';
  document.getElementById('ptext').innerHTML='<span style="color:var(--muted);font-size:.88rem">Press Start Race to begin…</span>';
  document.getElementById('result-box').style.display='none';
  document.getElementById('racers').innerHTML='';
  document.getElementById('searching-ui').classList.remove('on');
  document.getElementById('btn-solo').style.display='';
  document.getElementById('btn-live').style.display='';
  resetStats();
}

function resetStats(){document.getElementById('s-wpm').textContent='0';document.getElementById('s-acc').textContent='100%';document.getElementById('s-time').textContent='0s';}

function countdown(cb) {
  let n=3; const ov=document.getElementById('cdown'), el=document.getElementById('cnum');
  ov.classList.add('on'); el.textContent=n; el.style.color='';
  const iv=setInterval(()=>{
    n--;
    if(n>0){el.style.animation='none';void el.offsetWidth;el.style.animation='cpop .45s ease';el.textContent=n;}
    else if(n===0){el.textContent='GO!';el.style.color='#00e676';}
    else{clearInterval(iv);ov.classList.remove('on');cb();}
  },700);
}

function renderRacers(mode) {
  const el=document.getElementById('racers'); el.innerHTML='';
  el.innerHTML+=`<div class="rrow"><div class="rlabel you">YOU</div><div class="rbar-wrap"><div class="rbar you" id="bar-you" style="width:0%"><span id="pct-you">0%</span></div></div><div class="rwpm" id="pwpm-you">0 wpm</div></div>`;
  if(mode==='solo'){
    RS.bots.forEach((b,i)=>{ el.innerHTML+=`<div class="rrow"><div class="rlabel bot">${esc(b.name)}</div><div class="rbar-wrap"><div class="rbar bot" id="bar-bot-${i}" style="width:0%"><span id="bpct-${i}">0%</span></div></div><div class="rwpm" id="bwpm-${i}">0 wpm</div></div>`; });
  } else if(mode==='live') {
    el.innerHTML+=`<div class="rrow"><div class="rlabel live" id="opp-label">Opponent</div><div class="rbar-wrap"><div class="rbar opp" id="bar-opp" style="width:0%"><span id="pct-opp">0%</span></div></div><div class="rwpm" id="pwpm-opp">0 wpm</div></div>`;
  }
}

function renderPromptText() {
  const el=document.getElementById('ptext'), typed=RS.typed, prompt=RS.prompt; let html='';
  for(let i=0;i<prompt.length;i++){
    if(i<typed.length) html+=typed[i]===prompt[i]?`<span class="ok">${esc(prompt[i])}</span>`:`<span class="bad">${esc(prompt[i])}</span>`;
    else if(i===typed.length) html+=`<span class="cur">${esc(prompt[i])}</span>`;
    else html+=`<span class="dim">${esc(prompt[i])}</span>`;
  }
  el.innerHTML=html;
}

// Input listener
document.addEventListener('DOMContentLoaded',()=>{
  const inp=document.getElementById('tinput');
  inp.addEventListener('paste',e=>e.preventDefault());
  inp.addEventListener('drop',e=>e.preventDefault());
  inp.addEventListener('keydown', e => {
    // Disable Backspace to prevent correcting errors
    if (e.key === 'Backspace') e.preventDefault();
  });
  inp.addEventListener('input',e=>{
    if((!RS.active&&!liveRS.active)||RS.finished)return;
    const val=e.target.value, prompt=RS.prompt;
    
    // Prevent decreasing value (no backspace/selection delete)
    if(val.length < lastLen) { e.target.value = RS.typed; return; }

    if(val.length>lastLen+1){e.target.value=val.slice(0,lastLen+1);lastLen=e.target.value.length;return;}
    lastLen=val.length;
    let errs=0; for(let i=0;i<val.length;i++){if(i>=prompt.length||val[i]!==prompt[i])errs++;}
    RS.errors=errs;
    document.getElementById('s-acc').textContent=Math.max(0,val.length?Math.round(((val.length-errs)/val.length)*100):100)+'%';
    RS.typed=val; renderPromptText();
    if(activeMods&&activeMods.has('speedhack')){const _em=(Date.now()-RS.startTime)/60000;const _w=val.trim().split(/\s+/).filter(Boolean).length;const _wpm=_em>0?Math.round(_w/_em):0;document.getElementById('s-wpm').textContent=_wpm;document.getElementById('pwpm-you').textContent=_wpm+' wpm';}
    const pct=Math.min(100,Math.round((val.length/prompt.length)*100));
    const bar=document.getElementById('bar-you');
    if(bar){bar.style.width=pct+'%';document.getElementById('pct-you').textContent=pct+'%';}
    if(val.length >= prompt.length){
      if(RS.mode==='solo') soloFinished();
      else liveFinished();
    }
  });
});

// ── LIVE RACE ENGINE ────────────────────────────────────
let liveRS={searching:false,active:false,lobbyId:null,role:null,prompt:'',startTime:null,finished:false,opUser:null,lobbyUnsub:null,searchTimer:null,searchElapsed:0,searchDisplayIv:null,progressIv:null};

function startLiveSearch() {
  if(RS.active||liveRS.searching||liveRS.active)return;
  if(!FB_READY){showToast('Live Race requires Firebase to be configured!');return;}
  liveRS.searching=true; liveRS.searchElapsed=0;
  document.getElementById('searching-ui').classList.add('on');
  document.getElementById('btn-solo').style.display='none';
  document.getElementById('btn-live').style.display='none';
  document.getElementById('search-status').textContent='Searching for opponents…';
  document.getElementById('search-matched').style.display='none';
  document.getElementById('search-timer').textContent='0s';
  liveRS.searchDisplayIv=setInterval(()=>{
    liveRS.searchElapsed++;
    document.getElementById('search-timer').textContent=liveRS.searchElapsed+'s';
  },1000);
  liveRS.searchTimer=setTimeout(()=>cancelLiveSearch('No opponents found. Try again!'),60000);
  findOrCreateLobby();
}

async function findOrCreateLobby() {
  try {
    // Look for an open lobby (not hosted by this user, created within last 70s)
    const cutoff=Date.now()-70000;
    const snap=await db.collection('lobbies').where('status','==','waiting').where('host','!=',getU()).orderBy('host').orderBy('createdAt').get();
    const fresh=snap.docs.filter(d=>d.data().createdAt>cutoff);
    if(fresh.length>0) {
      // Join existing lobby
      const lobbyDoc=fresh[0]; const startAt=Date.now()+4000;
      await db.collection('lobbies').doc(lobbyDoc.id).update({guest:getU(),status:'racing',startAt});
      liveRS.lobbyId=lobbyDoc.id; liveRS.role='guest'; liveRS.opUser=lobbyDoc.data().host;
      listenLobby(lobbyDoc.id);
    } else {
      // Create new lobby
      const prompt=PROMPTS[Math.floor(Math.random()*PROMPTS.length)];
      const ref=db.collection('lobbies').doc();
      await ref.set({id:ref.id,host:getU(),hostPct:0,hostWpm:0,hostDone:false,hostTime:null,guest:null,guestPct:0,guestWpm:0,guestDone:false,guestTime:null,prompt,status:'waiting',startAt:null,createdAt:Date.now()});
      liveRS.lobbyId=ref.id; liveRS.role='host';
      listenLobby(ref.id);
    }
  } catch(e) { console.error('Lobby error:',e); cancelLiveSearch('Connection error. Try again.'); }
}

function listenLobby(id) {
  if(liveRS.lobbyUnsub) liveRS.lobbyUnsub();
  liveRS.lobbyUnsub=db.collection('lobbies').doc(id).onSnapshot(doc=>{
    if(!doc.exists){cancelLiveSearch('Lobby expired.');return;}
    handleLobbySnap(doc.data());
  });
}

let liveStarted=false;
function handleLobbySnap(lobby) {
  if(lobby.status==='racing'&&!liveStarted&&liveRS.searching) {
    // Opponent found / race starting
    liveStarted=true;
    liveRS.opUser=liveRS.role==='host'?lobby.guest:lobby.host;
    liveRS.prompt=lobby.prompt; RS.prompt=lobby.prompt; RS.mode='live';
    document.getElementById('search-status').textContent='Opponent found: '+liveRS.opUser+'!';
    document.getElementById('search-matched').style.display='block';
    document.getElementById('search-matched').textContent='🎮 '+liveRS.opUser+' joined — race starting!';
    clearInterval(liveRS.searchDisplayIv); clearTimeout(liveRS.searchTimer);
    const now=Date.now(), delay=lobby.startAt-now;
    renderRacers('live'); document.getElementById('opp-label').textContent=liveRS.opUser;
    renderPromptText();
    setTimeout(()=>{
      document.getElementById('searching-ui').classList.remove('on');
      countdown(()=>beginLive(lobby));
    }, Math.max(0,delay-3000));
  } else if(lobby.status==='racing'&&liveRS.active) {
    // Update opponent bar
    const myRole=liveRS.role, opRole=myRole==='host'?'guest':'host';
    const opPct=lobby[opRole+'Pct']||0, opWpm=lobby[opRole+'Wpm']||0;
    const bar=document.getElementById('bar-opp');
    if(bar){bar.style.width=opPct+'%';document.getElementById('pct-opp').textContent=opPct+'%';}
    document.getElementById('pwpm-opp').textContent=opWpm+' wpm';
    // Check if opponent finished
    if(lobby[opRole+'Done']&&!RS.finished) {
      // Opponent beat us — end our race
      setTimeout(()=>{ if(!RS.finished) liveFinished(true); },500);
    }
  }
}

function beginLive(lobby) {
  liveRS.searching=false; liveRS.active=true;
  RS.active=true; RS.typed=''; RS.errors=0; RS.startTime=Date.now(); RS.finished=false;
  const inp=document.getElementById('tinput'); inp.disabled=false; inp.value=''; lastLen=0; inp.focus();
  // Push progress updates
  liveRS.progressIv=setInterval(async()=>{
    if(!liveRS.active||RS.finished)return;
    const myRole=liveRS.role, elapsed=(Date.now()-RS.startTime)/60000;
    const words=RS.typed.trim().split(/\s+/).filter(Boolean).length;
    const wpm=elapsed>0?Math.round(words/elapsed):0;
    const pct=Math.min(100,Math.round((RS.typed.length/RS.prompt.length)*100));
    try { await db.collection('lobbies').doc(liveRS.lobbyId).update({[myRole+'Pct']:pct,[myRole+'Wpm']:wpm}); } catch(e){}
  },800);
  RS.timerIv=setInterval(()=>{
    if(!RS.active)return;
    const e=Date.now()-RS.startTime;
    document.getElementById('s-time').textContent=(e/1000).toFixed(1)+'s';
    const em=e/60000, words=RS.typed.trim().split(/\s+/).filter(Boolean).length;
    const wpm=em>0?Math.round(words/em):0;
    document.getElementById('s-wpm').textContent=wpm;
    document.getElementById('pwpm-you').textContent=wpm+' wpm';
  },200);
}

async function liveFinished(opponentWon=false) {
  if(RS.finished)return;
  RS.active=false; RS.finished=true; liveRS.active=false;
  RS.endTime=Date.now(); clearInterval(RS.timerIv); clearInterval(liveRS.progressIv);
  document.getElementById('tinput').disabled=true;
  const myRole=liveRS.role;
  const elapsed=RS.endTime-RS.startTime;
  const wpm=Math.round(RS.prompt.trim().split(/\s+/).length/(elapsed/60000));
  const acc=Math.max(0,Math.round(((RS.prompt.length-RS.errors)/RS.prompt.length)*100));
  try { await db.collection('lobbies').doc(liveRS.lobbyId).update({[myRole+'Done']:true,[myRole+'Time']:RS.endTime}); } catch(e){}
  const place=opponentWon?2:1;
  const baseCoins=place===1?75:20;
  const coins=Math.round(baseCoins * (acc / 100));
  if(UC){UC.coins=(UC.coins||0)+coins;await dbUpdateUser(getU(),{coins:UC.coins});refreshCoins();}
  await checkAndGrantSecretThemes(wpm);
  await checkBadges({wpm,place,isLive:true});
  showResult(place,coins,wpm,acc,elapsed);
  setTimeout(()=>{ try{db.collection('lobbies').doc(liveRS.lobbyId).update({status:'done'});}catch(e){} },500);
  liveRSreset();
}

function liveRSreset() {
  liveStarted=false;
  if(liveRS.lobbyUnsub){liveRS.lobbyUnsub();liveRS.lobbyUnsub=null;}
  clearInterval(liveRS.progressIv); clearInterval(liveRS.searchDisplayIv); clearTimeout(liveRS.searchTimer);
  liveRS={searching:false,active:false,lobbyId:null,role:null,prompt:'',startTime:null,finished:false,opUser:null,lobbyUnsub:null,searchTimer:null,searchElapsed:0,searchDisplayIv:null,progressIv:null};
}

function cancelLiveSearch(msg='Search cancelled.') {
  // Delete lobby if we created it
  if(liveRS.lobbyId&&liveRS.role==='host'){try{db.collection('lobbies').doc(liveRS.lobbyId).delete();}catch(e){}}
  liveRSreset(); RS.mode='solo';
  document.getElementById('searching-ui').classList.remove('on');
  document.getElementById('btn-solo').style.display='';
  document.getElementById('btn-live').style.display='';
  document.getElementById('racers').innerHTML='';
  showToast(msg);
}

function liveCleanup() {
  if(liveRS.lobbyId&&liveRS.role==='host'&&liveRS.searching){try{db.collection('lobbies').doc(liveRS.lobbyId).delete();}catch(e){}}
  liveRSreset();
}

// ── SHOP / THEMES ───────────────────────────────────────
const THEMES=[
  {id:'default',name:'Red Black Gradient',desc:'The classic LiquidType look.',price:0,prev:'prev-default'},
  {id:'disco',name:'Disco',desc:'Full rainbow color cycling.',price:200,prev:'prev-disco'},
  {id:'ocean',name:'Ocean Deep',desc:'Deep blue underwater vibes.',price:150,prev:'prev-ocean'},
  {id:'synthwave',name:'Synthwave',desc:'Retro purple neon nights.',price:200,prev:'prev-synthwave'},
  {id:'midnight',name:'Midnight Blue',desc:'Dark navy with soft purple.',price:150,prev:'prev-midnight'},
  {id:'toxic',name:'Toxic',desc:'Radioactive green on black.',price:250,prev:'prev-toxic'},
  {id:'sunset',name:'Sunset',desc:'Orange and deep purple dusk.',price:200,prev:'prev-sunset'},
  {id:'blood',name:'Blood',desc:'Deep crimson red on black.',price:150,prev:'prev-blood'},
  {id:'arctic',name:'Arctic',desc:'Cold icy blue tones.',price:150,prev:'prev-arctic'},
  {id:'lava',name:'Lava',desc:'Molten orange lava flow.',price:200,prev:'prev-lava'},
  {id:'galaxy',name:'Galaxy',desc:'Deep space purple nebula.',price:250,prev:'prev-galaxy'},
  {id:'forest',name:'Forest',desc:'Dark woodland green.',price:150,prev:'prev-forest'},
  {id:'cherry',name:'Cherry',desc:'Hot pink cherry blossom.',price:200,prev:'prev-cherry'},
  {id:'gold',name:'Gold',desc:'Luxurious gold on black.',price:300,prev:'prev-gold'},
  {id:'matrix',name:'Matrix',desc:'Green code on black.',price:200,prev:'prev-matrix'},
  {id:'copper',name:'Copper',desc:'Warm metallic copper tones.',price:175,prev:'prev-copper'},
  {id:'rose',name:'Rose',desc:'Soft pink rose glow.',price:175,prev:'prev-rose'},
  {id:'ice',name:'Ice',desc:'Crisp pale ice blue.',price:150,prev:'prev-ice'},
  {id:'ash',name:'Ash',desc:'Minimal grey on black.',price:100,prev:'prev-ash'},
  {id:'neonpink',name:'Neon Pink',desc:'Electric hot pink neon.',price:225,prev:'prev-neonpink'},
  {id:'neonblue',name:'Neon Blue',desc:'Electric cobalt neon.',price:225,prev:'prev-neonblue'},
  {id:'amber',name:'Amber',desc:'Warm amber orange glow.',price:175,prev:'prev-amber'},
  {id:'wine',name:'Wine',desc:'Deep crimson wine red.',price:175,prev:'prev-wine'},
  {id:'coffee',name:'Coffee',desc:'Rich warm brown tones.',price:125,prev:'prev-coffee'},
  {id:'storm',name:'Storm',desc:'Dark stormy blue grey.',price:175,prev:'prev-storm'},
  {id:'fire',name:'Fire',desc:'Intense fire red and orange.',price:200,prev:'prev-fire'},
  {id:'void',name:'Void',desc:'Pure black with white.',price:150,prev:'prev-void'},
  {id:'sakura',name:'Sakura',desc:'Soft cherry blossom pink.',price:200,prev:'prev-sakura'},
  {id:'rust',name:'Rust',desc:'Dark burnt rust orange.',price:150,prev:'prev-rust'},
  {id:'aqua',name:'Aqua',desc:'Bright teal and turquoise.',price:200,prev:'prev-aqua'},
  {id:'emerald',name:'Emerald',desc:'Deep rich emerald green.',price:225,prev:'prev-emerald'},
  {id:'violet',name:'Violet',desc:'Deep violet purple.',price:200,prev:'prev-violet'},
  {id:'steel',name:'Steel',desc:'Cool metallic steel blue.',price:175,prev:'prev-steel'},
  {id:'coral',name:'Coral',desc:'Warm coral red-orange.',price:175,prev:'prev-coral'},
  {id:'mint',name:'Mint',desc:'Fresh cool mint green.',price:150,prev:'prev-mint'},
  {id:'lavender',name:'Lavender',desc:'Soft dreamy lavender.',price:150,prev:'prev-lavender'},
  {id:'cyber',name:'Cyber',desc:'Cyberpunk yellow-green.',price:250,prev:'prev-cyber'},
  {id:'bloodmoon',name:'Blood Moon',desc:'Dark crimson lunar glow.',price:275,prev:'prev-bloodmoon'},
  {id:'neonorange',name:'Neon Orange',desc:'Blazing electric orange.',price:225,prev:'prev-neonorange'},
  {id:'deepsea',name:'Deep Sea',desc:'Abyssal dark ocean blue.',price:200,prev:'prev-deepsea'},
  {id:'solar',name:'Solar',desc:'Brilliant solar gold.',price:225,prev:'prev-solar'},
  {id:'terminal',name:'Terminal',desc:'Old school CRT green.',price:175,prev:'prev-terminal'},
  {id:'purplerain',name:'Purple Rain',desc:'Deep purple rainstorm.',price:225,prev:'prev-purplerain'},
  {id:'holographic',name:'Holographic',desc:'Shifting rainbow holo. ✨',price:400,prev:'prev-holographic'},
  {id:'obsidian',name:'Obsidian',desc:'Black volcanic glass.',price:200,prev:'prev-obsidian'},
  {id:'aurora',name:'Aurora',desc:'Northern lights green glow.',price:300,prev:'prev-aurora'},
  {id:'candy',name:'Candy',desc:'Sweet neon candy pink.',price:200,prev:'prev-candy'},
  {id:'infrared',name:'Infrared',desc:'Deep infrared heat red.',price:225,prev:'prev-infrared'},
  {id:'custom',name:'Custom Gradient',desc:'Design your own colors.',price:300,prev:'prev-custom'},,
  {id:'glitch',name:'??????????',desc:'???',price:0,prev:'prev-glitch',secret:true},
  {id:'voidwalker',name:'??????????',desc:'???',price:0,prev:'prev-voidwalker',secret:true},
  {id:'prismatic',name:'??????????',desc:'???',price:0,prev:'prev-prismatic',secret:true},
  {id:'corruption',name:'??????????',desc:'???',price:0,prev:'prev-corruption',secret:true},
];

function renderShop() {
  const acc=UC; if(!acc)return;
  document.getElementById('shop-coins').textContent=acc.coins||0;
  const grid=document.getElementById('sgrid'), gm=document.getElementById('gmbox');
  grid.innerHTML='';
  THEMES.forEach(t=>{
    const owned=(acc.themes||[]).includes(t.id), active=acc.activeTheme===t.id;
    let act='';
    if(active) act=`<div class="badge-on">Active</div><button class="towned">✓ Equipped</button>`;
    else if(owned||activeMods.has('litematica')) act=`<button class="tequip" onclick="equipTheme('${t.id}')">Equip${activeMods.has('litematica')&&!owned?' 🎨':''}</button>`;
    else if(t.price===0) act=`<div class="badge-free">Free</div><button class="tequip" onclick="equipTheme('${t.id}')">Equip</button>`;
    else{const dp=getDiscountedPrice(t.price);const saved=t.price-dp;act=`<div class="tprice">${saved>0?'<s style="color:var(--muted);font-size:.75rem">🧢 '+t.price+'</s> ':''}🧢 ${dp}${saved>0?' <span style="color:#00e676;font-size:.72rem">-'+Math.round(saved/t.price*100)+'%</span>':''}</div><button class="tbuy" onclick="buyTheme('${t.id}',${t.price})" ${(acc.coins||0)<dp?'disabled':''}>Buy & Equip</button>`;}
    grid.innerHTML+=`<div class="tcard"><div class="tprev ${t.prev}">${t.name}</div><div class="tname">${t.name}</div><div class="tdesc">${t.desc}</div>${act}</div>`;
  });
  if((acc.themes||[]).includes('custom')&&acc.activeTheme==='custom'){gm.classList.add('on');if(acc.gradientColors){document.getElementById('gm1').value=acc.gradientColors.c1||'#001a2e';document.getElementById('gm2').value=acc.gradientColors.c2||'#002b4d';document.getElementById('gm3').value=acc.gradientColors.c3||'#003d6b';document.getElementById('gma').value=acc.gradientColors.ca||'#00c8ff';gmPreview();}}
  else gm.classList.remove('on');
  loadDPThemesIntoShop();
}

async function buyTheme(id,price){
  const discountedPrice=getDiscountedPrice(price);
  if(!UC||(UC.coins||0)<discountedPrice){showToast('Not enough bottlecaps!');return;}
  const themes=[...(UC.themes||[]),id];
  UC.coins-=discountedPrice; UC.themes=themes; UC.activeTheme=id;
  await dbUpdateUser(getU(),{coins:UC.coins,themes,activeTheme:id});
  applyTheme(id,UC.gradientColors); refreshCoins(); renderShop();
  if(id==='custom')document.getElementById('gmbox').classList.add('on');
  const savedAmt=price-discountedPrice;
  showToast('Theme unlocked! 🎉'+(savedAmt>0?' (saved '+savedAmt+' 🧢)':''));
}

async function equipTheme(id){
  if(!UC)return; UC.activeTheme=id;
  await dbUpdateUser(getU(),{activeTheme:id});
  applyTheme(id,UC.gradientColors); renderShop(); showToast('Theme equipped!');
}

function applyTheme(id,gc) {
  const B=document.body;
  // Remove all theme classes
  B.className=B.className.replace(/theme-\S+/g,'').trim();
  const map={
    disco:'theme-disco',ocean:'theme-ocean',synthwave:'theme-synthwave',midnight:'theme-midnight',
    toxic:'theme-toxic',sunset:'theme-sunset',blood:'theme-blood',arctic:'theme-arctic',
    lava:'theme-lava',galaxy:'theme-galaxy',forest:'theme-forest',cherry:'theme-cherry',
    gold:'theme-gold',matrix:'theme-matrix',copper:'theme-copper',rose:'theme-rose',
    ice:'theme-ice',ash:'theme-ash',neonpink:'theme-neonpink',neonblue:'theme-neonblue',
    amber:'theme-amber',wine:'theme-wine',coffee:'theme-coffee',storm:'theme-storm',
    fire:'theme-fire',void:'theme-void',sakura:'theme-sakura',rust:'theme-rust',
    aqua:'theme-aqua',emerald:'theme-emerald',violet:'theme-violet',steel:'theme-steel',
    coral:'theme-coral',mint:'theme-mint',lavender:'theme-lavender',cyber:'theme-cyber',
    bloodmoon:'theme-bloodmoon',neonorange:'theme-neonorange',deepsea:'theme-deepsea',
    solar:'theme-solar',terminal:'theme-terminal',purplerain:'theme-purplerain',
    holographic:'theme-holographic',obsidian:'theme-obsidian',aurora:'theme-aurora',
    candy:'theme-candy',infrared:'theme-infrared',custom:'theme-custom-gradient',
    glitch:'theme-glitch',voidwalker:'theme-voidwalker',prismatic:'theme-prismatic',corruption:'theme-corruption'
  };
  B.classList.add(map[id]||'theme-default');
  if(id==='custom'&&gc)applyGradVars(gc);
}
function applyGradVars(c){const r=document.documentElement.style;r.setProperty('--cg1',c.c1||'#001a2e');r.setProperty('--cg2',c.c2||'#002b4d');r.setProperty('--cg3',c.c3||'#003d6b');r.setProperty('--cga',c.ca||'#00c8ff');r.setProperty('--cgb',lghtn(c.ca||'#00c8ff',20));r.setProperty('--cgc',lghtn(c.ca||'#00c8ff',40));}
function lghtn(h,a){const n=parseInt(h.replace('#',''),16);return `#${Math.min(255,((n>>16)&255)+a).toString(16).padStart(2,'0')}${Math.min(255,((n>>8)&255)+a).toString(16).padStart(2,'0')}${Math.min(255,(n&255)+a).toString(16).padStart(2,'0')}`;}
function gmPreview(){const c1=document.getElementById('gm1').value,c2=document.getElementById('gm2').value,c3=document.getElementById('gm3').value;document.getElementById('gmprev').style.background=`linear-gradient(135deg,${c1},${c2},${c3})`;}
async function applyGradient(){const c={c1:document.getElementById('gm1').value,c2:document.getElementById('gm2').value,c3:document.getElementById('gm3').value,ca:document.getElementById('gma').value};if(UC)UC.gradientColors=c;await dbUpdateUser(getU(),{gradientColors:c,activeTheme:'custom'});applyGradVars(c);applyTheme('custom',c);showToast('Gradient applied! ✨');}

// ── CHAT ────────────────────────────────────────────────
async function sendChat(){
  const inp=document.getElementById('cinput'), text=inp.value.trim();
  const username = getU();
  if(!text||!username)return;
  if(UC&&UC.muted){showToast('🔇 You are muted and cannot chat.');inp.value='';return;}
  inp.value='';
  
  const filteredText=applyWordFilter(text);
  const replyData=chatReplyTarget?{...chatReplyTarget}:null;
  chatClearReply();
  // Original Firebase logic
  await dbAddMsg({id:'m'+Date.now()+Math.random().toString(36).substr(2,4),username,text:filteredText,ts:Date.now(),edited:false,pinned:false,replyTo:replyData||null});
  if(!FB_READY)scrollMsgs();

  // Additional Cloudflare Worker sync
  fetch("https://bgichat.finnarthur17-465.workers.dev/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username, message: text })
  }).catch(err => console.error("Cloudflare Worker sync failed:", err));
}
function renderChat(){
  const el=document.getElementById('msgs');
  if(!chatCache.length){el.innerHTML='<div class="empty">No messages yet. Say hello! 👋</div>';return;}
  const atBot=el.scrollHeight-el.scrollTop-el.clientHeight<70;
  const me=getU();
  const pinned=chatCache.filter(m=>m.pinned);
  const pinnedBar=pinned.length?`<div class="chat-pinned-bar">📌 <b>${esc(pinned[pinned.length-1].username)}:</b> ${esc(pinned[pinned.length-1].text.slice(0,60))}${pinned[pinned.length-1].text.length>60?'…':''}</div>`:'';
  el.innerHTML=pinnedBar+chatCache.map(m=>{
    const isOwn=m.username===me;
    const editedTag=m.edited?'<span class="edited-tag">(edited)</span>':'';
    const trolledTag=m.trolled?`<span class="trolled-tag">(trolled by ${esc(m.trolledBy||'?')})</span>`:'';
    const vtHistory=activeMods.has('ventype')&&_msgHistory[m.id]?_msgHistory[m.id].map(h=>`<div class="vt-history">${h.deleted?'🗑 [DELETED]':'✏ '+esc(h.text)} <span style="color:var(--muted);font-size:.65rem">${new Date(h.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span></div>`).join(''):'';
    const spyHighlight=activeMods.has('chatspy')&&window._chatSpyTarget&&m.username===window._chatSpyTarget?' msg-spy':'';
    const mentionHL=activeMods.has('pingmention')&&getU()&&m.text.toLowerCase().includes((getU()||'').toLowerCase())&&m.username!==getU()?' msg-mention':'';
    const hideMsg=activeMods.has('hidejoins')&&window._modHideTarget&&m.username!==window._modHideTarget&&m.username!==getU();
    const richIcon=activeMods.has('richpresence')&&m.username===getU()?'<span class="rich-icon">✦</span>':'';
    const pinnedTag=m.pinned?'<span class="pinned-tag">📌</span>':'';
    const replyHTML=m.replyTo?`<div class="msg-reply-preview" onclick="scrollToMsg('${esca(m.replyTo.id)}')">↩ <b>${esc(m.replyTo.username)}:</b> ${esc((m.replyTo.text||'').slice(0,60))}</div>`:'';
    const actionsOwn=`<button class="mact edit" onclick="chatStartEdit('${esca(m.id)}')">✏</button><button class="mact del" onclick="chatDelete('${esca(m.id)}')">🗑</button>`;
    const actionsAll=`<button class="mact reply" onclick="chatSetReply('${esca(m.id)}','${esca(m.username)}','${esca(m.text.slice(0,60))}')">↩</button><button class="mact pin" onclick="chatTogglePin('${esca(m.id)}')">${m.pinned?'📍':'📌'}</button>`;
    const actions=`<div class="msg-actions">${isOwn?actionsOwn:''}${actionsAll}</div>`;
    const editWrap=isOwn?`<div class="msg-edit-wrap" id="edit-wrap-${m.id}"><input class="edit-inp" id="edit-inp-${m.id}" value="${esc(m.text)}" maxlength="250" onkeydown="if(event.key==='Enter')chatSaveEdit('${esca(m.id)}');if(event.key==='Escape')chatCancelEdit('${esca(m.id)}')"><button class="edit-save" onclick="chatSaveEdit('${esca(m.id)}')">Save</button><button class="edit-cancel" onclick="chatCancelEdit('${esca(m.id)}')">Cancel</button></div>`:'';
    if(hideMsg)return'';
    return `<div class="cmsg${m.pinned?' msg-is-pinned':''}${spyHighlight}${mentionHL}" data-id="${m.id}" id="cmsg-${m.id}">${actions}<div class="cavatar" onclick="openProfile('${esca(m.username)}')" style="cursor:pointer">${esc(m.username.charAt(0).toUpperCase())}</div><div class="cbody">${replyHTML}<div class="chdr"><span class="cuser" onclick="openProfile('${esca(m.username)}')">${esc(m.username)}</span><span class="ctime">${(activeMods.has('timestamps')&&window._modFullTs?new Date(m.ts).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):new Date(m.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}</span>${editedTag}${trolledTag}${pinnedTag}${richIcon}${activeMods.has('rainbowname')&&m.username===getU()?'<style>.cmsg[id="cmsg-'+m.id+'"] .cuser{animation:rainbowText 2s linear infinite}</style>':''}</div><div class="ctext" id="ctext-${m.id}">${esc(m.text)}</div>${activeMods.has('wordcount')?`<div class="mod-wordcount">${m.text.trim().split(/\s+/).length} words</div>`:''}
${vtHistory}${editWrap}</div></div>`;
  }).join('');
  if(atBot)scrollMsgs();
}
function scrollToMsg(id){const el=document.getElementById('cmsg-'+id);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('msg-highlight');setTimeout(()=>el.classList.remove('msg-highlight'),1500);}}
let chatReplyTarget=null;
function chatSetReply(id,username,text){
  chatReplyTarget={id,username,text};
  const bar=document.getElementById('chat-reply-bar');
  if(bar){bar.style.display='flex';document.getElementById('chat-reply-text').textContent=`↩ ${username}: ${text.slice(0,60)}`;}
  document.getElementById('cinput').focus();
}
function chatClearReply(){
  chatReplyTarget=null;
  const bar=document.getElementById('chat-reply-bar');
  if(bar)bar.style.display='none';
}
async function chatTogglePin(id){
  if(!FB_READY)return;
  const m=chatCache.find(x=>x.id===id);
  if(!m)return;
  await db.collection('messages').doc(id).update({pinned:!m.pinned});
  showToast(m.pinned?'Message unpinned':'📌 Message pinned');
}

// Chat own-message edit/delete
function chatStartEdit(id){
  document.getElementById('edit-wrap-'+id).classList.add('on');
  document.getElementById('ctext-'+id).style.display='none';
  const inp=document.getElementById('edit-inp-'+id);
  inp.focus(); inp.select();
}
function chatCancelEdit(id){
  document.getElementById('edit-wrap-'+id).classList.remove('on');
  document.getElementById('ctext-'+id).style.display='';
}
async function chatSaveEdit(id){
  const val=document.getElementById('edit-inp-'+id).value.trim();
  if(!val){showToast('Message cannot be empty.');return;}
  await dbEditMsg(id,val);
  showToast('Message edited ✓');
}
async function chatDelete(id){
  await dbDelMsg(id);
  showToast('Message deleted.');
}
function scrollMsgs(){const e=document.getElementById('msgs');e.scrollTop=e.scrollHeight;}

// ── LEADERBOARD ─────────────────────────────────────────
async function renderLB(){
  const tbody=document.getElementById('lb-body');
  tbody.innerHTML='<tr><td colspan="4" style="text-align:center;padding:18px;color:var(--muted)">Loading…</td></tr>';
  const accs=(await dbAllUsers()).sort((a,b)=>(b.coins||0)-(a.coins||0));
  if(!accs.length){tbody.innerHTML='<tr><td colspan="4" class="empty">No players yet.</td></tr>';return;}
  tbody.innerHTML=accs.map((a,i)=>{const bd=a.equippedBadge?ALL_BADGES.find(x=>x.id===a.equippedBadge):null;const bdHTML=bd?`<span title="${esc(bd.name)}" style="margin-left:5px;font-size:.85rem">${bd.icon}</span>`:'';return `<tr><td><span class="lbrank ${['r1','r2','r3',''][Math.min(i,3)]}">${['🥇','🥈','🥉','#'+(i+1)][Math.min(i,3)]}</span></td><td class="lbname" style="cursor:pointer" onclick="openProfile('${esca(a.username)}')">${esc(a.username)}${activeMods&&activeMods.has('richpresence')&&a.username===getU()?'<span class="rich-icon">✦</span>':''}${bdHTML}</td><td class="lbcoins">🧢 ${a.coins||0}</td><td style="color:var(--muted);font-size:.82rem">${(a.themes||[]).length} theme${(a.themes||[]).length!==1?'s':''}</td></tr>`;}).join('');
}

// ── ADMIN ────────────────────────────────────────────────
let ADMIN_PW='randomflexeshisdihtoalice'; let admOpen=false;
function openAdmin(){document.getElementById('adm-overlay').classList.add('on');document.getElementById('adm-pw').value='';document.getElementById('adm-err').textContent='';if(admOpen)renderAdm();}
function closeAdmin(){document.getElementById('adm-overlay').classList.remove('on');}
function tryAdmin(){const v=document.getElementById('adm-pw').value;if(v===ADMIN_PW){admOpen=true;document.getElementById('adm-lock').style.display='none';document.getElementById('adm-open').classList.add('on');renderAdm();}else document.getElementById('adm-err').textContent='Wrong password.';}
async function renderAdm(){await renderAdmAccounts();renderAdmChat();}
async function renderAdmAccounts(){
  const tbody=document.getElementById('adm-tbody');
  tbody.innerHTML='<tr><td colspan="4" style="text-align:center;padding:10px;color:var(--muted)">Loading…</td></tr>';
  const accs=await dbAllUsers();
  if(!accs.length){tbody.innerHTML='<tr><td colspan="4" class="empty">No accounts.</td></tr>';return;}
  tbody.innerHTML=accs.map(a=>`<tr><td style="font-weight:700">${esc(a.username)}</td><td class="tdpass" style="filter:blur(5px);user-select:none" title="Hidden for security">••••••••</td><td class="tdcoins">🧢 ${a.coins||0}</td><td class="tdact"><input class="coinamt" id="ca-${esca(a.username)}" type="number" value="50" min="1" max="99999"><button class="bsm give" onclick="admGive('${esca(a.username)}')">+Give</button><button class="bsm take" onclick="admTake('${esca(a.username)}')">-Take</button><button class="bsm ${a.muted?'unmute':'mute'}" onclick="admToggleMute('${esca(a.username)}')">${a.muted?'🔈 Unmute':'🔇 Mute'}</button><button class="bsm del" onclick="admDel('${esca(a.username)}')">🗑 Del</button></td></tr>`).join('');
}
async function admGive(u){const amt=parseInt(document.getElementById('ca-'+u).value)||0;if(amt<=0)return;const acc=await dbGetUser(u);if(!acc)return;await dbUpdateUser(u,{coins:(acc.coins||0)+amt});if(u===getU())refreshCoins();showToast(`+${amt} bottlecaps → ${u}`);renderAdmAccounts();}
async function admTake(u){const amt=parseInt(document.getElementById('ca-'+u).value)||0;if(amt<=0)return;const acc=await dbGetUser(u);if(!acc)return;await dbUpdateUser(u,{coins:Math.max(0,(acc.coins||0)-amt)});if(u===getU())refreshCoins();showToast(`-${amt} bottlecaps ← ${u}`);renderAdmAccounts();}
async function admDel(u){if(!confirm(`Delete "${u}"?`))return;await dbDeleteUser(u);if(u===getU()){doLogout();return;}showToast(`Deleted ${u}`);renderAdmAccounts();}
async function admToggleMute(u){const acc=await dbGetUser(u);if(!acc)return;const nowMuted=!acc.muted;await dbUpdateUser(u,{muted:nowMuted});showToast(nowMuted?`🔇 ${u} muted`:`🔈 ${u} unmuted`);renderAdmAccounts();}
function renderAdmChat(){
  const el=document.getElementById('adm-chat');
  if(!chatCache.length){el.innerHTML='<div class="empty">No messages.</div>';return;}
  el.innerHTML=chatCache.map(m=>{
    const time=(activeMods.has('timestamps')&&window._modFullTs?new Date(m.ts).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):new Date(m.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));
    const editedTag=m.edited?' <span style="color:var(--muted);font-size:.7rem;font-style:italic">(edited)</span>':'';
    return `<div class="mcmsg" id="adm-msg-${m.id}">
      <div class="mcmsg-txt" style="flex:1">
        <span class="mcuser">${esc(m.username)}</span>
        <span style="color:var(--muted);font-size:.72rem">${time}</span>${editedTag}<br>
        <span id="adm-txt-${m.id}">${esc(m.text)}</span>
        <div class="mcmsg-edit-wrap" id="adm-edit-${m.id}">
          <input class="mc-edit-inp" id="adm-einp-${m.id}" value="${esc(m.text)}" maxlength="250">
          <div style="display:flex;gap:6px"><button class="edit-save" onclick="admSaveEdit('${esca(m.id)}')">Save</button><button class="edit-cancel" onclick="admCancelEdit('${esca(m.id)}')">Cancel</button></div>
        </div>
      </div>
      <div class="mcmsg-actions">
        <button class="bsm edit" onclick="admStartEdit('${esca(m.id)}')">✏ Edit</button>
        <button class="bsm rm" onclick="modDel('${esca(m.id)}','adm')">🗑 Del</button>
      </div>
    </div>`;
  }).join('');
}
function admStartEdit(id){document.getElementById('adm-edit-'+id).classList.add('on');document.getElementById('adm-txt-'+id).style.display='none';document.getElementById('adm-einp-'+id).focus();}
function admCancelEdit(id){document.getElementById('adm-edit-'+id).classList.remove('on');document.getElementById('adm-txt-'+id).style.display='';}
async function admSaveEdit(id){const v=document.getElementById('adm-einp-'+id).value.trim();if(!v){showToast('Cannot be empty.');return;}await dbEditMsg(id,v);showToast('Message edited ✓');}
async function modDel(id,src){await dbDelMsg(id);if(src==='adm')renderAdmChat();else renderDPChat();showToast('Message deleted.');}
// keep old rmMsg name working too
async function rmMsg(id,src){await modDel(id,src);}

// ── DEPOULE ──────────────────────────────────────────────
let DP_PW='beer'; let dpOpen=false;
function openDP(){document.getElementById('dp-overlay').classList.add('on');document.getElementById('dp-pw').value='';document.getElementById('dp-err').textContent='';if(dpOpen)renderDPChat();}
function closeDP(){document.getElementById('dp-overlay').classList.remove('on');}
function tryDP(){const v=document.getElementById('dp-pw').value;if(v===DP_PW){dpOpen=true;document.getElementById('dp-lock').style.display='none';document.getElementById('dp-open').classList.add('on');renderDPChat();renderDPReports();renderDPCodes();renderDPWordFilter();renderDPPublishedThemes();}else document.getElementById('dp-err').textContent='Wrong password.';}
function renderDPReports(){
  const el=document.getElementById('dp-reports');
  if(!el)return;
  if(!FB_READY){el.innerHTML='<div class="empty">Reports require Firebase.</div>';return;}
  db.collection('reports').orderBy('ts','desc').limit(50).get().then(snap=>{
    if(snap.empty){el.innerHTML='<div class="empty">No reports yet.</div>';return;}
    el.innerHTML=snap.docs.map(d=>{
      const r=d.data();
      const time=new Date(r.ts).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
      const statusColor=r.status==='punished'?'#ff4444':r.status==='forgiven'?'#00e676':'#ffd700';
      return `<div class="report-item" id="rpt-${d.id}">
        <div class="report-header">
          <div class="report-accused">🚩 <span style="font-weight:700;color:var(--accent2)">${esc(r.accused)}</span></div>
          <div class="report-meta">
            <span style="color:var(--muted);font-size:.72rem">reported by ${esc(r.reporter)}</span>
            <span class="report-status" style="color:${statusColor};font-size:.72rem;font-weight:700;margin-left:8px">${r.status||'pending'}</span>
          </div>
        </div>
        <div class="report-reason">${esc(r.reason)}</div>
        <div class="report-time" style="font-size:.68rem;color:var(--muted);margin-top:4px">${time}</div>
        ${r.status==='pending'?`<div class="report-actions">
          <button class="bsm punish" onclick="reportPunish('${d.id}','${esca(r.accused)}')">⚡ Punish</button>
          <button class="bsm forgive" onclick="reportForgive('${d.id}')">✅ Forgive</button>
          <button class="bsm del" onclick="reportDismiss('${d.id}')">🗑 Dismiss</button>
        </div>`:''}
      </div>`;
    }).join('');
  }).catch(e=>{el.innerHTML='<div class="empty">Error loading reports.</div>';console.error(e);});
}

async function reportPunish(reportId, accused){
  const action=prompt(`Punish ${accused}:\n1. Mute\n2. Delete account\n\nEnter action (mute/delete) or a coin deduction number:`);
  if(!action)return;
  const a=action.trim().toLowerCase();
  if(a==='mute'){
    await dbUpdateUser(accused,{muted:true});
    showToast(`🔇 ${accused} muted.`);
  } else if(a==='delete'){
    if(!confirm(`Permanently delete account "${accused}"?`))return;
    await dbDeleteUser(accused);
    showToast(`🗑 ${accused} deleted.`);
  } else {
    const amt=parseInt(a);
    if(amt>0){
      const acc=await dbGetUser(accused);
      if(acc){await dbUpdateUser(accused,{coins:Math.max(0,(acc.coins||0)-amt)});showToast(`-${amt} bottlecaps from ${accused}.`);}
    }
  }
  await db.collection('reports').doc(reportId).update({status:'punished'});
  renderDPReports();
}

async function reportForgive(reportId){
  await db.collection('reports').doc(reportId).update({status:'forgiven'});
  showToast('Report marked as forgiven.');
  renderDPReports();
}

async function reportDismiss(reportId){
  await db.collection('reports').doc(reportId).delete();
  showToast('Report dismissed.');
  renderDPReports();
}

let reportTarget=null;
function openReportModal(username){
  reportTarget=username;
  document.getElementById('report-overlay').classList.add('on');
  document.getElementById('report-reason-inp').value='';
  document.getElementById('report-target-name').textContent=username;
  document.getElementById('report-err').textContent='';
}
function closeReportModal(){
  document.getElementById('report-overlay').classList.remove('on');
  reportTarget=null;
}
async function submitReport(){
  if(!reportTarget||!getU())return;
  const reason=document.getElementById('report-reason-inp').value.trim();
  if(!reason){document.getElementById('report-err').textContent='Please enter a reason.';return;}
  if(!FB_READY){showToast('Reports require Firebase.');return;}
  const btn=document.getElementById('report-submit-btn');
  btn.disabled=true;btn.textContent='Sending…';
  await db.collection('reports').add({accused:reportTarget,reporter:getU(),reason,ts:Date.now(),status:'pending'});
  await checkBadges({reports:true});
  closeReportModal();
  showToast('Report submitted.');
  btn.disabled=false;btn.textContent='Submit Report';
}

function renderDPChat(){
  const el=document.getElementById('dp-chat');
  if(!chatCache.length){el.innerHTML='<div class="empty">No messages to moderate.</div>';return;}
  el.innerHTML=chatCache.map(m=>{
    const time=(activeMods.has('timestamps')&&window._modFullTs?new Date(m.ts).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):new Date(m.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));
    const editedTag=m.edited?' <span style="color:var(--muted);font-size:.7rem;font-style:italic">(edited)</span>':'';
    return `<div class="mcmsg" id="dp-msg-${m.id}">
      <div class="mcmsg-txt" style="flex:1">
        <span class="mcuser">${esc(m.username)}</span>
        <span style="color:var(--muted);font-size:.72rem">${time}</span>${editedTag}<br>
        <span id="dp-txt-${m.id}">${esc(m.text)}</span>
        <div class="mcmsg-edit-wrap" id="dp-edit-${m.id}">
          <input class="mc-edit-inp" id="dp-einp-${m.id}" value="${esc(m.text)}" maxlength="250">
          <div style="display:flex;gap:6px"><button class="edit-save" onclick="dpSaveEdit('${esca(m.id)}')">Save</button><button class="edit-cancel" onclick="dpCancelEdit('${esca(m.id)}')">Cancel</button></div>
        </div>
      </div>
      <div class="mcmsg-actions">
        <button class="bsm edit" onclick="dpStartEdit('${esca(m.id)}')">✏ Edit</button>
        <button class="bsm rm" onclick="modDel('${esca(m.id)}','dp')">🗑 Del</button>
      </div>
    </div>`;
  }).join('');
}
function dpStartEdit(id){document.getElementById('dp-edit-'+id).classList.add('on');document.getElementById('dp-txt-'+id).style.display='none';document.getElementById('dp-einp-'+id).focus();}
function dpCancelEdit(id){document.getElementById('dp-edit-'+id).classList.remove('on');document.getElementById('dp-txt-'+id).style.display='';}
async function dpSaveEdit(id){const v=document.getElementById('dp-einp-'+id).value.trim();if(!v){showToast('Cannot be empty.');return;}await dbEditMsg(id,v);showToast('Message edited ✓');}

// ── PROFILE MODAL ────────────────────────────────────────
const THEME_COLORS={
  default:'#cc0000',disco:'#ff00ff',ocean:'#00aaff',synthwave:'#ff00cc',midnight:'#6666ff',
  toxic:'#00ff44',sunset:'#ff6600',blood:'#ff0000',arctic:'#aaddff',lava:'#ff6600',
  galaxy:'#9933ff',forest:'#22aa44',cherry:'#ff2266',gold:'#ffcc00',matrix:'#00ff00',
  copper:'#cc6622',rose:'#ff4499',ice:'#88ddff',ash:'#aaaaaa',neonpink:'#ff00aa',
  neonblue:'#0066ff',amber:'#ff9900',wine:'#cc0044',coffee:'#aa7744',storm:'#4466aa',
  fire:'#ff3300',void:'#ffffff',sakura:'#ff88bb',rust:'#cc4400',aqua:'#00ccbb',
  emerald:'#00aa66',violet:'#8800ff',steel:'#4488aa',coral:'#ff5533',mint:'#44ddaa',
  lavender:'#bb88ff',cyber:'#ddff00',bloodmoon:'#ff4400',neonorange:'#ff6600',
  deepsea:'#0033aa',solar:'#ffcc00',terminal:'#00bb00',purplerain:'#7700cc',
  holographic:'#ff66ff',obsidian:'#6644ff',aurora:'#00ffaa',candy:'#ff44cc',
  infrared:'#ff0055',custom:'#00c8ff'
};
const RANK_BADGES=[
  {min:0,label:'Newcomer',color:'rgba(150,150,150,.3)',border:'rgba(150,150,150,.4)'},
  {min:200,label:'Racer',color:'rgba(0,180,100,.2)',border:'rgba(0,180,100,.4)'},
  {min:500,label:'Speedster',color:'rgba(0,150,255,.2)',border:'rgba(0,150,255,.4)'},
  {min:1000,label:'Pro Typer',color:'rgba(200,0,255,.2)',border:'rgba(200,0,255,.4)'},
  {min:2500,label:'Champion',color:'rgba(255,165,0,.2)',border:'rgba(255,165,0,.4)'},
  {min:5000,label:'Legend',color:'rgba(255,215,0,.25)',border:'rgba(255,215,0,.5)'},
];
function getRankBadge(coins){let b=RANK_BADGES[0];for(const r of RANK_BADGES){if((coins||0)>=r.min)b=r;}return b;}

let profileTarget=null;
async function openProfile(username){
  if(!username)return;
  profileTarget=username;
  document.getElementById('prof-overlay').classList.add('on');
  document.getElementById('prof-name').textContent='Loading…';
  document.getElementById('prof-coins').textContent='…';
  document.getElementById('prof-streak').textContent='…';
  document.getElementById('prof-themes').textContent='…';
  document.getElementById('prof-theme-row').innerHTML='';
  document.getElementById('prof-actions').innerHTML='<div style="color:var(--muted);text-align:center;padding:8px;font-size:.88rem">Loading…</div>';

  const acc=await dbGetUser(username);
  if(!acc){showToast('Could not load profile.');closeProfile();return;}

  const isSelf=username===getU();
  const badge=getRankBadge(acc.coins);
  const streak=acc.streak||1;
  const themes=acc.themes||['default'];

  document.getElementById('prof-avatar').textContent=username.charAt(0).toUpperCase();
  document.getElementById('prof-name').textContent=acc.username;
  const badgeEl=document.getElementById('prof-badge');
  badgeEl.textContent=badge.label;
  badgeEl.style.background=badge.color;
  badgeEl.style.border=`1px solid ${badge.border}`;
  badgeEl.style.color='var(--text)';
  document.getElementById('prof-coins').textContent=acc.coins||0;
  document.getElementById('prof-streak').textContent=streak;
  document.getElementById('prof-themes').textContent=themes.length;

  // XRay mod: extra info
  const xrayEl=document.getElementById('prof-xray');
  if(xrayEl){
    if(activeMods&&activeMods.has('xray')){
      xrayEl.style.display='block';
      xrayEl.innerHTML=`<div style="margin-top:12px;padding:10px 14px;background:rgba(255,136,0,.07);border:1px solid rgba(255,136,0,.2);border-radius:8px;font-size:.8rem">
        <div style="color:#ff8800;font-family:'Bebas Neue',cursive;letter-spacing:2px;margin-bottom:6px">🔍 XRAY DATA</div>
        <div style="color:var(--muted)">Last Active: <span style="color:var(--text)">${acc.lastLoginDate||'Unknown'}</span></div>
        <div style="color:var(--muted);margin-top:3px">Streak: <span style="color:var(--text)">${acc.streak||1} day${(acc.streak||1)!==1?'s':''}</span></div>
        <div style="color:var(--muted);margin-top:3px">Themes Owned: <span style="color:var(--text)">${themes.length}</span></div>
        <div style="color:var(--muted);margin-top:3px">Badges: <span style="color:var(--text)">${(acc.badges||[]).length}</span></div>
      </div>`;
    } else { xrayEl.style.display='none'; }
  }

  // Theme dots
  const themeRow=document.getElementById('prof-theme-row');
  themeRow.innerHTML=`<span class="prof-theme-lbl">Themes:</span>`+
    themes.map(t=>`<div class="prof-theme-dot" title="${t}" style="background:${THEME_COLORS[t]||'#888'}"></div>`).join('')+
    `<span class="prof-theme-lbl" style="margin-left:2px">${themes.map(t=>t.charAt(0).toUpperCase()+t.slice(1)).join(', ')}</span>`;

  // Actions
  const actEl=document.getElementById('prof-actions');
  if(isSelf){
    actEl.innerHTML=`<div class="prof-self-note">This is your profile! Earn coins by racing 🏁</div>`;
  } else {
    actEl.innerHTML=`
      <div style="font-size:.78rem;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Gift Coins to ${esc(acc.username)}</div>
      <div class="gift-row">
        <input class="gift-input" id="gift-amt" type="number" min="1" placeholder="Amount…" value="10">
        <button class="gift-btn" id="gift-btn" onclick="giftCoins()">🎁 Gift</button>
      </div>
      <div style="font-size:.75rem;color:var(--muted);margin-top:5px">Your balance: 🧢 ${UC?UC.coins:0} bottlecaps</div>
      <button onclick="openDMWith('${esca(acc.username)}')" style="width:100%;margin-top:10px;padding:10px;border:none;border-radius:8px;background:linear-gradient(135deg,#003366,#0055aa);color:#fff;font-family:'Rajdhani',sans-serif;font-size:.95rem;font-weight:700;letter-spacing:1px;cursor:pointer;">✉ Message</button>
      <button onclick="openReportModal('${esca(acc.username)}')" style="width:100%;margin-top:8px;padding:10px;border:none;border-radius:8px;background:rgba(200,0,0,.15);border:1px solid rgba(200,0,0,.3);color:#ff6666;font-family:'Rajdhani',sans-serif;font-size:.95rem;font-weight:700;letter-spacing:1px;cursor:pointer;">🚩 Report</button>
      <button onclick="openTrollModal('${esca(acc.username)}')" style="width:100%;margin-top:8px;padding:10px;border:none;border-radius:8px;background:rgba(255,140,0,.1);border:1px solid rgba(255,140,0,.3);color:#ffaa44;font-family:'Rajdhani',sans-serif;font-size:.95rem;font-weight:700;letter-spacing:1px;cursor:pointer;">🎭 Troll</button>
    `;
  }
}

function closeProfile(){
  document.getElementById('prof-overlay').classList.remove('on');
  profileTarget=null;
}

async function giftCoins(){
  if(!profileTarget||!UC)return;
  const amt=parseInt(document.getElementById('gift-amt').value)||0;
  if(amt<=0){showToast('Enter a valid amount.');return;}
  if(amt>(UC.coins||0)){showToast('Not enough bottlecaps!');return;}
  const btn=document.getElementById('gift-btn');
  btn.disabled=true; btn.textContent='Sending…';
  const target=await dbGetUser(profileTarget);
  if(!target){showToast('User not found.');btn.disabled=false;btn.textContent='🎁 Gift';return;}
  // Deduct from self
  UC.coins=(UC.coins||0)-amt;
  await dbUpdateUser(getU(),{coins:UC.coins});
  // Add to target
  await dbUpdateUser(profileTarget,{coins:(target.coins||0)+amt});
  refreshCoins();
  await checkBadges({gifts:true});
  showToast(`Gifted 🧢 ${amt} bottlecaps to ${profileTarget}!`);
  closeProfile();
}

// ── DEPOULE PET BUTTON ───────────────────────────────────
let petState={color:'green',timer:null,wins:0,losses:0,pets:0,net:0,combo:0,goodPetStreak:0,rageMode:false,cooldown:false};
const RAGE_MESSAGES=['DePoule is FURIOUS 😡','IT BURNS 🔥','RUN. 💀','THE ENTITY RAGES','PAIN IS COMING'];
const WIN_MESSAGES=['Nice pet 😌','It approves…','Lucky…','It liked that','Blessed 🍀','DePoule purrs…','Combo! ⚡'];
const LOSE_MESSAGES=['It bit you 😡','OUCH 💀','DePoule attacks!','Bad timing!','It feeds on you','PUNISHED','You fool 💀'];
function initPetBtn(){petState.rageMode=false;schedulePetFlip();}
function getFlipDelay(){return petState.rageMode?200+Math.random()*600:600+Math.random()*2400;}
function schedulePetFlip(){
  if(petState.timer)clearTimeout(petState.timer);
  petState.timer=setTimeout(()=>{
    // Green Favor upgrades reduce red chance; Rage Resistance upgrades reduce rage red chance
    const redChanceNormal=0.5-(dpHasUpgrade('gf3')?0.35:dpHasUpgrade('gf2')?0.20:dpHasUpgrade('gf1')?0.10:0);
    const redChanceRage=dpHasUpgrade('rr2')?0.55:dpHasUpgrade('rr1')?0.65:0.75;
    const isRed=petState.rageMode?Math.random()<redChanceRage:Math.random()<redChanceNormal;
    petState.color=isRed?'red':'green';
    const btn=document.getElementById('pet-btn');
    if(!btn){schedulePetFlip();return;}
    btn.className='pet-btn '+petState.color+(petState.rageMode?' rage-mode':'');
    btn.textContent=petState.color==='green'?'🐾 PET':'⚠ PET';
    const hint=document.getElementById('pet-hint');
    if(hint){
      if(petState.rageMode){hint.className='pet-hint bad';hint.textContent='RAGE MODE — 75% red!';}
      else{hint.className='pet-hint '+(petState.color==='green'?'good':'bad');hint.textContent=petState.color==='green'?'🟢 Green — pet now!':'🔴 Red — danger!';}
    }
    schedulePetFlip();
  },getFlipDelay());
}
async function petDePoule(){
  if(petState.cooldown||!UC)return;
  petState.cooldown=true;
  // Quick Hands upgrade: 50% cooldown reduction
  const cooldownMs=dpHasUpgrade('sp1')?60:120;
  setTimeout(()=>petState.cooldown=false,cooldownMs);
  const won=petState.color==='green';
  petState.pets++;
  if(UC){UC.totalPets=(UC.totalPets||0)+1;if(UC.totalPets===50){dbUpdateUser(getU(),{totalPets:UC.totalPets});grantBadge('depoule_pet');}if(UC.totalPets===100){dbUpdateUser(getU(),{totalPets:UC.totalPets});grantBadge('depoule_chosen');}}
  if(won){
    petState.wins++;petState.combo++;petState.goodPetStreak++;
    // Combo Master upgrades change jackpot frequency
    const jackpotEvery=dpHasUpgrade('cm2')?6:dpHasUpgrade('cm1')?8:10;
    const isJackpot=petState.combo>0&&petState.combo%jackpotEvery===0;
    // Jackpot bonus from upgrades
    const jpBase=10;
    const jpBonus=(dpHasUpgrade('jp3')?20:0)+(dpHasUpgrade('jp2')?10:0)+(dpHasUpgrade('jp1')?5:0);
    const jpTotal=jpBase+jpBonus;
    // Base earn upgrades
    const baseEarn=(dpHasUpgrade('be2')?2:0)+(dpHasUpgrade('be1')?1:0);
    // Combo multiplier bonus
    const comboMult=dpHasUpgrade('cm_mult')?1:0;
    const coinGain=isJackpot?jpTotal:petState.combo>=5?(3+comboMult+baseEarn):petState.combo>=3?(2+comboMult+baseEarn):(1+baseEarn);
    petState.net+=coinGain;
    UC.coins=Math.max(0,(UC.coins||0)+coinGain);
    await dbUpdateUser(getU(),{coins:UC.coins});refreshCoins();
    const res=document.getElementById('pet-result');
    if(isJackpot){res.textContent='JACKPOT +'+coinGain+'🪙';res.className='pet-result jackpot';showToast('JACKPOT!! +'+coinGain+' coins! 🎰');}
    else{res.textContent='+'+(coinGain>1?coinGain+' 🧢':'1 🪙');res.className='pet-result win';}
    const hint=document.getElementById('pet-hint');
    if(hint){hint.className='pet-hint '+(isJackpot?'jackpot-hint':'good');hint.textContent=isJackpot?'JACKPOT!! 🎰':WIN_MESSAGES[Math.floor(Math.random()*WIN_MESSAGES.length)]+(petState.combo>1?' (x'+petState.combo+'!)':'');}
    petState.rageMode=false;const skl=document.getElementById('dp-skull');if(skl)skl.classList.remove('rage');
    // Check good pet streak discount milestones (every 50)
    if(petState.goodPetStreak>0&&petState.goodPetStreak%50===0){
      const disc=getDPStreakDiscount();
      showToast(`🦆 ${petState.goodPetStreak} good pets! ${disc}% shop discount active!`);
    }
    updateStreakBar();
  } else {
    petState.losses++;petState.combo=0;petState.goodPetStreak=0;
    // Loss Shield upgrades change big-loss frequency
    const bigLossEvery=dpHasUpgrade('ls3')?9999:dpHasUpgrade('ls2')?10:dpHasUpgrade('ls1')?7:5;
    const bigLoss=petState.losses%bigLossEvery===0;
    const coinLoss=bigLoss?5:1;
    petState.net-=coinLoss;
    UC.coins=Math.max(0,(UC.coins||0)-coinLoss);
    await dbUpdateUser(getU(),{coins:UC.coins});refreshCoins();
    const res=document.getElementById('pet-result');
    res.textContent=bigLoss?'PUNISHED −'+coinLoss+'🪙':'−1 🪙';res.className='pet-result lose';
    const hint=document.getElementById('pet-hint');
    if(hint){hint.className='pet-hint bad';hint.textContent=LOSE_MESSAGES[Math.floor(Math.random()*LOSE_MESSAGES.length)];}
    shakePanel();
    updateStreakBar();
    if(bigLoss){
      const skl=document.getElementById('dp-skull');if(skl)skl.classList.add('rage');
      petState.rageMode=true;
      if(document.getElementById('dp-mood'))document.getElementById('dp-mood').textContent=RAGE_MESSAGES[Math.floor(Math.random()*RAGE_MESSAGES.length)];
      showToast('DePoule ENTERS RAGE MODE! 😡🔥');
      clearTimeout(petState.timer);schedulePetFlip();
      setTimeout(()=>{petState.rageMode=false;const skl2=document.getElementById('dp-skull');if(skl2)skl2.classList.remove('rage');const btn=document.getElementById('pet-btn');if(btn)btn.classList.remove('rage-mode');if(document.getElementById('dp-mood'))document.getElementById('dp-mood').textContent=getMoodText();},8000);
    }
  }
  updatePetUI();
  setTimeout(()=>{const res=document.getElementById('pet-result');if(res)res.textContent='';if(!petState.rageMode){const hint=document.getElementById('pet-hint');if(hint){hint.className='pet-hint neutral';hint.textContent='Pet DePoule… if you dare';}}},1400);
}
function shakePanel(){const p=document.getElementById('depoule-panel');if(!p)return;p.classList.remove('shaking');void p.offsetWidth;p.classList.add('shaking');setTimeout(()=>p.classList.remove('shaking'),450);}
function getMoodText(){if(petState.pets===0)return 'Dormant…';const r=petState.wins/petState.pets;if(r>0.7)return 'Content 😌';if(r>0.5)return 'Neutral…';if(r>0.3)return 'Irritated 😤';return 'Hostile 😡';}
function updatePetUI(){
  document.getElementById('dp-wins').textContent=petState.wins;
  document.getElementById('dp-losses').textContent=petState.losses;
  document.getElementById('dp-pets').textContent=petState.pets;
  const net=petState.net;document.getElementById('dp-pet-net').textContent=(net>=0?'+':'')+net;
  const cb=document.getElementById('combo-bar');const cl=document.getElementById('combo-label');
  if(cb)cb.style.width=Math.min(100,(petState.combo/10)*100)+'%';
  if(cl)cl.textContent=petState.combo>0?'Combo: '+petState.combo+'x — '+(petState.combo>=10?'JACKPOT READY 🎰':petState.combo>=5?'+3 per pet':petState.combo>=3?'+2 per pet':'+1 per pet'):'Combo: 0x';
  if(!petState.rageMode&&document.getElementById('dp-mood'))document.getElementById('dp-mood').textContent=getMoodText();
}

// ── TOAST ────────────────────────────────────────────────
let tTimer=null;
function showToast(msg){let t=document.querySelector('.toast');if(t)t.remove();t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);if(tTimer)clearTimeout(tTimer);tTimer=setTimeout(()=>t&&t.remove(),2800);}

// modal overlay close
document.getElementById('prof-overlay').addEventListener('click',function(e){if(e.target===this)closeProfile()});
document.getElementById('adm-overlay').addEventListener('click',function(e){if(e.target===this)closeAdmin()});
document.getElementById('report-overlay').addEventListener('click',function(e){if(e.target===this)closeReportModal()});
document.getElementById('settings-overlay').addEventListener('click',function(e){if(e.target===this)closeSettings()});
document.getElementById('ulog-overlay').addEventListener('click',function(e){if(e.target===this)closeUpdateLog()});
document.getElementById('mgr-overlay').addEventListener('click',function(e){if(e.target===this)closeManager()});
document.getElementById('dp-overlay').addEventListener('click',function(e){if(e.target===this)closeDP()});

// cleanup on page leave
window.addEventListener('beforeunload',()=>{if(liveRS.lobbyId&&liveRS.role==='host'&&liveRS.searching){try{db.collection('lobbies').doc(liveRS.lobbyId).delete();}catch(e){}}});

const TIPS = [
  "As hell awaits, As heaven fades away, to the light of God, and to the darkness of the devil, all with an endless possibility. -Bac",
  "Next Update -- Light Yagami vs. Santa Claus",
  "Race me now or don't waste my time!",
  "LiquidType is currently on verson 2.3.14",
  "Shout out to Finn for helping!",
  "Stare Harder...",
  "What makes you very happy?",
  "The best way to get coins is DePoule!"
];

function startLoadingSequence(isLoggedIn) {
  const loading = document.getElementById('loading');
  const status = document.getElementById('ld-status');
  if (status) status.style.display = 'none';

  // Accessibility Check: Respect user system settings for motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  loading.classList.add('loading-anim-active');

  // Particle Spawner
  const words = ["TYPE", "COINS", "ACCURACY", "RACE", "LIQUID", "DEPOULE", "COINS", "STREAK"];
  let shootingToCenter = false;
  const modeToggleIv = setInterval(() => { shootingToCenter = !shootingToCenter; }, 800);
  // Reduce count significantly if reduced motion is requested
  const maxParts = prefersReducedMotion ? 10 : ((navigator.hardwareConcurrency || 4) >= 8 ? 500 : 250);

  const spawnPart = () => {
    const p = document.createElement('div');
    p.className = 'ld-part';
    p.textContent = words[Math.floor(Math.random() * words.length)];
    
    const angle = Math.random() * Math.PI * 2;
    const dist = window.innerWidth > 1000 ? 1000 : 600;
    const sx = Math.cos(angle) * dist;
    const sy = Math.sin(angle) * dist;

    let ex, ey;
    if (shootingToCenter) {
      ex = 0; ey = 0;
    } else {
      // Shoot across to roughly the opposite side
      const oppAngle = angle + Math.PI + (Math.random() - 0.5);
      ex = Math.cos(oppAngle) * dist;
      ey = Math.sin(oppAngle) * dist;
    }

    p.style.fontSize = (Math.random() * 1.4 + 0.5) + 'rem';
    p.style.setProperty('--sx', sx + 'px');
    p.style.setProperty('--sy', sy + 'px');
    p.style.setProperty('--ex', ex + 'px');
    p.style.setProperty('--ey', ey + 'px');
    p.style.setProperty('--sr', (Math.random() * 720 - 360) + 'deg');
    p.style.setProperty('--er', (Math.random() * 720 - 360) + 'deg');
    
    // Slower duration for reduced motion
    const dur = prefersReducedMotion ? (Math.random() * 1 + 1) : (Math.random() * 0.15 + 0.15);
    p.style.animation = `ldShot ${dur}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`;
    loading.appendChild(p);
    setTimeout(() => p.remove(), dur * 1000);
  };

  const batchSize = prefersReducedMotion ? 1 : Math.ceil(maxParts / 10);
  const spawnIv = setInterval(() => {
    for(let i=0; i<batchSize; i++) spawnPart();
  }, prefersReducedMotion ? 500 : 25);

  const tipWrap = document.createElement('div');
  tipWrap.className = 'ld-tip-wrap';
  loading.appendChild(tipWrap);

  const skipBtn = document.createElement('button');
  skipBtn.id = 'ld-skip';
  skipBtn.className = 'ld-btn';
  skipBtn.textContent = 'Skip Animation';
  loading.appendChild(skipBtn);

  const startBtn = document.createElement('button');
  startBtn.id = 'ld-start';
  startBtn.className = 'ld-btn';
  startBtn.textContent = 'Enter The Game';
  loading.appendChild(startBtn);

  let tipIdx = 0;
  const showNextTip = () => {
    tipWrap.innerHTML = `<div class="ld-tip active">${TIPS[tipIdx]}</div>`;
    tipIdx = (tipIdx + 1) % TIPS.length;
  };
  
  showNextTip();
  const tipIv = setInterval(showNextTip, 2500);
  setTimeout(() => skipBtn.classList.add('show'), 1500);

  const endAnimation = () => {
    clearInterval(spawnIv);
    clearInterval(modeToggleIv);
    clearInterval(tipIv);
    loading.classList.remove('loading-anim-active');
    skipBtn.classList.remove('show');
    startBtn.classList.add('show');
    tipWrap.innerHTML = `<div class="ld-tip active">System Initialized</div>`;
  };

  const animTimeout = setTimeout(endAnimation, 9000);
  skipBtn.onclick = () => { clearTimeout(animTimeout); endAnimation(); };
  startBtn.onclick = () => {
    loading.style.opacity = '0';
    setTimeout(() => {
      loading.style.display = 'none';
      if (isLoggedIn) enterApp(); else document.getElementById('auth').style.display = 'flex';
    }, 400);
  };
}

// ── INIT ─────────────────────────────────────────────────
// ── DIRECT MESSAGES ─────────────────────────────────────────
let dmListUnsub=null, dmConvoUnsub=null, activeDMId=null, dmCache={};

function getDMId(a,b){return [a,b].sort().join('__');}

function startDMListener(){
  if(!FB_READY||!getU())return;
  if(dmListUnsub)try{dmListUnsub();}catch(e){}
  dmListUnsub=db.collection('dms').where('participants','array-contains',getU()).onSnapshot(snap=>{
    snap.docs.forEach(d=>{dmCache[d.id]=d.data();});
    const ids=new Set(snap.docs.map(d=>d.id));
    Object.keys(dmCache).forEach(k=>{if(!ids.has(k))delete dmCache[k];});
    updateDMNotif();
    const dmTab=document.getElementById('tab-dm');
    if(dmTab&&dmTab.classList.contains('on')){
      renderDMList();
      if(activeDMId&&dmCache[activeDMId])renderDMConvo(activeDMId);
    }
  },err=>console.error('DM listener:',err));
}

function updateDMNotif(){
  const me=getU();
  const hasUnread=Object.values(dmCache).some(c=>(c['unread_'+me]||0)>0);
  const dot=document.getElementById('dm-notif');
  if(dot)dot.classList.toggle('on',hasUnread);
}

function renderDMList(){
  const el=document.getElementById('dm-list');
  if(!el)return;
  const me=getU();
  const convos=Object.values(dmCache).sort((a,b)=>(b.lastTs||0)-(a.lastTs||0));
  if(!convos.length){
    el.innerHTML='<div class="empty" style="padding:24px;text-align:center;font-size:.88rem">No conversations yet.<br><span style="color:var(--muted);font-size:.8rem">Open a profile and click ✉ Message</span></div>';
    return;
  }
  el.innerHTML=convos.map(c=>{
    const other=c.participants.find(p=>p!==me)||c.participants[0];
    const unread=c['unread_'+me]||0;
    const last=c.lastMsg?esc(c.lastMsg.slice(0,45)):'<span style="font-style:italic;opacity:.5">No messages yet</span>';
    const time=c.lastTs?new Date(c.lastTs).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'';
    const isActive=c.id===activeDMId;
    return `<div class="dm-convo-item${isActive?' active':''}" onclick="openDMConvo('${esca(c.id)}')">
      <div class="dm-ci-avatar">${esc(other.charAt(0).toUpperCase())}</div>
      <div class="dm-ci-info">
        <div class="dm-ci-name">${esc(other)}${unread>0?`<span class="dm-unread-badge">${unread}</span>`:''}</div>
        <div class="dm-ci-last">${last}</div>
      </div>
      <div class="dm-ci-time">${time}</div>
    </div>`;
  }).join('');
}

async function openDMWith(username){
  if(!getU()||username===getU())return;
  if(!FB_READY){showToast('DMs require Firebase.');return;}
  const id=getDMId(getU(),username);
  if(!dmCache[id]){
    const existing=await db.collection('dms').doc(id).get();
    if(!existing.exists){
      const newDoc={id,participants:[getU(),username],messages:[],lastTs:Date.now(),lastMsg:'',['unread_'+getU()]:0,['unread_'+username]:0};
      await db.collection('dms').doc(id).set(newDoc);
      dmCache[id]=newDoc;
    } else {
      dmCache[id]=existing.data();
    }
  }
  closeProfile();
  goTab('dm');
  openDMConvo(id);
}

async function openDMConvo(id){
  activeDMId=id;
  const me=getU();
  if(FB_READY&&(dmCache[id]?.['unread_'+me]||0)>0){
    try{await db.collection('dms').doc(id).update({['unread_'+me]:0});}catch(e){}
    if(dmCache[id])dmCache[id]['unread_'+me]=0;
  }
  updateDMNotif();
  renderDMList();
  const convo=dmCache[id];
  const other=convo?convo.participants.find(p=>p!==me)||convo.participants[0]:'Unknown';
  const hdr=document.getElementById('dm-convo-hdr');
  if(hdr)hdr.innerHTML=`<div class="dm-hdr-avatar">${esc(other.charAt(0).toUpperCase())}</div><div><div class="dm-hdr-name">${esc(other)}</div><div class="dm-hdr-sub">Direct Message</div></div>`;
  const wrap=document.getElementById('dm-input-wrap');
  if(wrap)wrap.style.display='flex';
  renderDMConvo(id);
  if(dmConvoUnsub)try{dmConvoUnsub();}catch(e){}
  if(FB_READY){
    dmConvoUnsub=db.collection('dms').doc(id).onSnapshot(doc=>{
      if(doc.exists){
        dmCache[id]=doc.data();
        if(activeDMId===id)renderDMConvo(id);
        if(dmCache[id]&&(dmCache[id]['unread_'+me]||0)>0){
          db.collection('dms').doc(id).update({['unread_'+me]:0}).catch(()=>{});
          dmCache[id]['unread_'+me]=0;
          updateDMNotif();
        }
      }
    });
  }
}

let dmReplyTarget=null;
function dmSetReply(msgId,from,text){
  dmReplyTarget={id:msgId,from,text};
  const bar=document.getElementById('dm-reply-bar');
  if(bar){bar.style.display='flex';document.getElementById('dm-reply-text').textContent=`↩ ${from}: ${text.slice(0,60)}`;}
  document.getElementById('dm-input').focus();
}
function dmClearReply(){
  dmReplyTarget=null;
  const bar=document.getElementById('dm-reply-bar');
  if(bar)bar.style.display='none';
}

function renderDMConvo(id){
  const el=document.getElementById('dm-msgs');
  if(!el)return;
  const convo=dmCache[id];
  if(!convo||!convo.messages||!convo.messages.length){
    el.innerHTML='<div class="empty" style="margin:auto;padding:32px;text-align:center;font-size:.88rem">No messages yet.<br><span style="color:var(--muted)">Say something!</span></div>';
    return;
  }
  const me=getU();
  const atBot=el.scrollHeight-el.scrollTop-el.clientHeight<100;
  const pinned=convo.pinned||[];
  const pinnedMsgs=convo.messages.filter(m=>pinned.includes(m.id));
  const pinnedBar=pinnedMsgs.length?`<div class="dm-pinned-bar">📌 <b>${esc(pinnedMsgs[pinnedMsgs.length-1].from)}:</b> ${esc(pinnedMsgs[pinnedMsgs.length-1].text.slice(0,60))}${pinnedMsgs[pinnedMsgs.length-1].text.length>60?'…':''}</div>`:'';
  el.innerHTML=pinnedBar+convo.messages.slice(-150).map(m=>{
    const mine=m.from===me;
    const isPinned=pinned.includes(m.id);
    const time=(activeMods.has('timestamps')&&window._modFullTs?new Date(m.ts).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):new Date(m.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));
    const editedTag=m.edited?'<span class="dm-edited">(edited)</span>':'';
    const replyHTML=m.replyTo?`<div class="dm-reply-preview">↩ <b>${esc(m.replyTo.from)}:</b> ${esc((m.replyTo.text||'').slice(0,50))}</div>`:'';
    const ownBtns=mine?`<button class="dm-act-btn" onclick="dmStartEdit('${esca(m.id)}')">✏</button><button class="dm-act-btn dm-act-del" onclick="dmDeleteMsg('${esca(m.id)}')">🗑</button>`:'';
    const sharedBtns=`<button class="dm-act-btn" onclick="dmSetReply('${esca(m.id)}','${esca(m.from)}','${esca(m.text.slice(0,60))}')">↩</button><button class="dm-act-btn" onclick="dmTogglePin('${esca(id)}','${esca(m.id)}')" title="${isPinned?'Unpin':'Pin'}">${isPinned?'📍':'📌'}</button>`;
    const actions=`<div class="dm-msg-actions">${ownBtns}${sharedBtns}</div>`;
    const editWrap=mine?`<div class="dm-edit-wrap" id="dm-ew-${m.id}"><input class="dm-edit-inp" id="dm-ei-${m.id}" value="${esc(m.text)}" maxlength="500" onkeydown="if(event.key==='Enter')dmSaveEdit('${esca(m.id)}');if(event.key==='Escape')dmCancelEdit('${esca(m.id)}')"><button class="dm-edit-save" onclick="dmSaveEdit('${esca(m.id)}')">Save</button><button class="dm-edit-cancel" onclick="dmCancelEdit('${esca(m.id)}')">Cancel</button></div>`:'';
    return `<div class="dm-msg${mine?' mine':' theirs'}${isPinned?' dm-pinned':''}" id="dm-m-${m.id}">${actions}${replyHTML}<div class="dm-bubble" id="dm-b-${m.id}">${esc(m.text)}${editedTag}</div><div class="dm-msg-time">${time}</div>${editWrap}</div>`;
  }).join('');
  if(atBot)el.scrollTop=el.scrollHeight;
}
function dmStartEdit(msgId){const b=document.getElementById('dm-b-'+msgId);const w=document.getElementById('dm-ew-'+msgId);if(!b||!w)return;b.style.display='none';w.style.display='flex';const inp=document.getElementById('dm-ei-'+msgId);if(inp){inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length);}}
function dmCancelEdit(msgId){const b=document.getElementById('dm-b-'+msgId);const w=document.getElementById('dm-ew-'+msgId);if(b)b.style.display='';if(w)w.style.display='none';}
async function dmSaveEdit(msgId){if(!activeDMId||!FB_READY)return;const inp=document.getElementById('dm-ei-'+msgId);const newText=inp?inp.value.trim():'';if(!newText){showToast('Cannot be empty.');return;}const convo=dmCache[activeDMId];if(!convo)return;const messages=(convo.messages||[]).map(m=>m.id===msgId?{...m,text:newText,edited:true}:m);await db.collection('dms').doc(activeDMId).update({messages});showToast('Edited ✓');}
async function dmDeleteMsg(msgId){if(!activeDMId||!FB_READY)return;if(!confirm('Delete this message?'))return;const convo=dmCache[activeDMId];if(!convo)return;const messages=(convo.messages||[]).filter(m=>m.id!==msgId);const pinned=(convo.pinned||[]).filter(p=>p!==msgId);const lastMsg=messages.length?messages[messages.length-1].text:'';await db.collection('dms').doc(activeDMId).update({messages,lastMsg,pinned});showToast('Deleted.');}
async function dmTogglePin(convId,msgId){if(!FB_READY)return;const convo=dmCache[convId];if(!convo)return;const pinned=convo.pinned||[];const newPinned=pinned.includes(msgId)?pinned.filter(p=>p!==msgId):[...pinned,msgId];await db.collection('dms').doc(convId).update({pinned:newPinned});showToast(newPinned.includes(msgId)?'📌 Pinned':'Unpinned');}

async function sendDM(){
  if(!activeDMId||!getU())return;
  const inp=document.getElementById('dm-input');
  const text=inp.value.trim();
  if(!text)return;
  if(UC&&UC.muted){showToast('🔇 You are muted and cannot send DMs.');inp.value='';return;}
  if(!FB_READY){showToast('DMs require Firebase.');return;}
  inp.value='';
  const convo=dmCache[activeDMId];
  if(!convo)return;
  const me=getU();
  const other=convo.participants.find(p=>p!==me);
  const dmFiltered=applyWordFilter(text);
  const dmReply=dmReplyTarget?{...dmReplyTarget}:null;
  dmClearReply();
  const msg={id:'d'+Date.now()+Math.random().toString(36).substr(2,4),from:me,text:dmFiltered,ts:Date.now(),replyTo:dmReply};
  const messages=[...(convo.messages||[]),msg].slice(-200);
  await db.collection('dms').doc(activeDMId).update({
    messages,lastMsg:text,lastTs:Date.now(),
    ['unread_'+other]:(convo['unread_'+other]||0)+1
  });
}



let MGR_PW='petershows';
let mgrOpen=false, updateLogCache=[];

function openUpdateLog(){
  document.getElementById('ulog-overlay').classList.add('on');
  renderUpdateLog();
}
function closeUpdateLog(){
  document.getElementById('ulog-overlay').classList.remove('on');
}
function openManager(){
  document.getElementById('mgr-overlay').classList.add('on');
  document.getElementById('mgr-pw').value='';
  document.getElementById('mgr-err').textContent='';
  if(mgrOpen)renderMgrList();
}
function closeManager(){
  document.getElementById('mgr-overlay').classList.remove('on');
}
function tryManager(){
  const v=document.getElementById('mgr-pw').value;
  if(v===MGR_PW){
    mgrOpen=true;
    document.getElementById('mgr-lock').style.display='none';
    document.getElementById('mgr-open').classList.add('on');
    renderMgrList();
  } else {
    document.getElementById('mgr-err').textContent='Wrong password.';
  }
}

async function loadUpdateLog(){
  if(FB_READY){
    try{
      const snap=await db.collection('updatelog').orderBy('createdAt','desc').get();
      updateLogCache=snap.docs.map(d=>({id:d.id,...d.data()}));
    }catch(e){
      updateLogCache=JSON.parse(localStorage.getItem('lt_ulog')||'[]');
    }
  } else {
    updateLogCache=JSON.parse(localStorage.getItem('lt_ulog')||'[]');
  }
}

async function renderUpdateLog(){
  const el=document.getElementById('ulog-list');
  el.innerHTML='<div class="empty">Loading…</div>';
  await loadUpdateLog();
  if(!updateLogCache.length){
    el.innerHTML='<div class="empty">No updates posted yet.</div>';
    return;
  }
  el.innerHTML=updateLogCache.map((u,i)=>`
    <div class="ulog-entry${i===0?' current':''}">
      <div class="ulog-header">
        <div class="ulog-version">Version ${esc(u.version)}</div>
        ${i===0?'<span class="ulog-badge">CURRENT</span>':'<span class="ulog-date">'+esc(u.dateRange||u.date||'')+'</span>'}
      </div>
      <ul class="ulog-changes">${(u.changes||[]).map(c=>`<li>${esc(c)}</li>`).join('')}</ul>
    </div>
  `).join('');
}

function renderMgrList(){
  const el=document.getElementById('mgr-list');
  if(!updateLogCache.length){
    el.innerHTML='<div class="empty">No entries yet. Click + New Entry to add one.</div>';
    return;
  }
  el.innerHTML=updateLogCache.map(u=>`
    <div class="mgr-entry">
      <div class="mgr-entry-info">
        <span class="mgr-ver">v${esc(u.version)}</span>
        <span class="mgr-date">${esc(u.dateRange||u.date||'')}</span>
      </div>
      <div class="mgr-entry-actions">
        <button class="bsm edit" onclick="mgrEdit('${esca(u.id)}')">✏ Edit</button>
        <button class="bsm del" onclick="mgrDelete('${esca(u.id)}')">🗑 Del</button>
      </div>
    </div>`).join('');
}

function mgrShowForm(entry){
  const form=document.getElementById('mgr-form');
  form.style.display='block';
  document.getElementById('mgr-edit-id').value=entry?entry.id:'';
  document.getElementById('mgr-v-input').value=entry?entry.version:'';
  document.getElementById('mgr-date-input').value=entry?(entry.dateRange||entry.date||''):'';
  document.getElementById('mgr-changes-input').value=entry?(entry.changes||[]).join('\n'):'';
  document.getElementById('mgr-form-title').textContent=entry?'Edit Entry':'New Entry';
  document.getElementById('mgr-v-input').focus();
}

function mgrEdit(id){
  const entry=updateLogCache.find(u=>u.id===id);
  if(entry)mgrShowForm(entry);
}

async function mgrSave(){
  const id=document.getElementById('mgr-edit-id').value;
  const version=document.getElementById('mgr-v-input').value.trim();
  const dateRange=document.getElementById('mgr-date-input').value.trim();
  const changesRaw=document.getElementById('mgr-changes-input').value;
  const changes=changesRaw.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!version){showToast('Version is required.');return;}
  if(!changes.length){showToast('Add at least one change.');return;}
  const now=Date.now();
  const data={version,dateRange,changes};
  if(FB_READY){
    if(id){
      await db.collection('updatelog').doc(id).update(data);
    } else {
      const ref=db.collection('updatelog').doc();
      await ref.set({id:ref.id,...data,createdAt:now});
    }
  } else {
    const list=JSON.parse(localStorage.getItem('lt_ulog')||'[]');
    if(id){
      const i=list.findIndex(u=>u.id===id);
      if(i>=0)list[i]={...list[i],...data};
    } else {
      list.unshift({id:'u'+now,...data,createdAt:now});
    }
    localStorage.setItem('lt_ulog',JSON.stringify(list));
  }
  document.getElementById('mgr-form').style.display='none';
  await loadUpdateLog();
  renderMgrList();
  showToast('Saved ✓');
}

async function mgrDelete(id){
  if(!confirm('Delete this entry?'))return;
  if(FB_READY){
    await db.collection('updatelog').doc(id).delete();
  } else {
    const list=JSON.parse(localStorage.getItem('lt_ulog')||'[]').filter(u=>u.id!==id);
    localStorage.setItem('lt_ulog',JSON.stringify(list));
  }
  await loadUpdateLog();
  renderMgrList();
  showToast('Deleted.');
}

// ── QUEST & SECRET THEME SYSTEM ────────────────────────────
const SECRET_QUEST_DATA = {
  glitch: {
    name:'Glitch',
    how:'Type at 60+ WPM in any race',
    check: ()=> (UC&&(UC.maxWpm||0)>=60),
  },
  voidwalker: {
    name:'Void Walker',
    how:'Log in 7 days in a row (streak ≥ 7)',
    check: ()=> (UC&&(UC.streak||0)>=7),
  },
  prismatic: {
    name:'Prismatic',
    how:'Own 15 or more themes',
    check: ()=> (UC&&(UC.themes||[]).length>=15),
  },
  corruption: {
    name:'Corruption',
    how:'Send exactly "depoule" in chat (lowercase)',
    check: ()=> false, // triggered manually via easter egg
  },
};

const SECRET_IDS=['glitch','voidwalker','prismatic','corruption'];
function nonSecretThemes(){return (UC&&UC.themes?UC.themes:[]).filter(t=>!SECRET_IDS.includes(t));}

async function checkAndGrantSecretThemes(wpm){
  if(!UC||!FB_READY)return;
  const themes=UC.themes||[];
  let granted=false;

  // Save best WPM regardless
  if(wpm>0){
    const best=Math.max(UC.maxWpm||0,wpm);
    if(best>(UC.maxWpm||0)){UC.maxWpm=best;await dbUpdateUser(getU(),{maxWpm:best});}
  }

  // Glitch: type 100+ WPM in one race
  if(wpm>=100 && !themes.includes('glitch')){
    UC.themes=[...themes,'glitch'];
    await dbUpdateUser(getU(),{themes:UC.themes});
    showSecretUnlock('glitch','You typed 100+ WPM in one race!');
    granted=true;
  }

  // Void Walker: 7-day streak — only check after login, not on wpm=0 startup calls
  if(wpm===0 && (UC.streak||0)>=7 && !themes.includes('voidwalker')){
    UC.themes=[...(UC.themes||themes),'voidwalker'];
    await dbUpdateUser(getU(),{themes:UC.themes});
    showSecretUnlock('voidwalker','You hit a 7-day login streak!');
    granted=true;
  }

  // Prismatic: own 15+ non-secret themes
  const normalCount=nonSecretThemes().length;
  if(normalCount>=15 && !themes.includes('prismatic')){
    UC.themes=[...(UC.themes||themes),'prismatic'];
    await dbUpdateUser(getU(),{themes:UC.themes});
    showSecretUnlock('prismatic','You collected 15 normal themes!');
    granted=true;
  }

  if(granted){renderShop();if(['glitch','voidwalker','prismatic','corruption'].every(t=>(UC.themes||[]).includes(t)))await grantBadge('void_walker');}
}

async function grantCorruptionTheme(){
  if(!UC||!FB_READY)return;
  if((UC.themes||[]).includes('corruption'))return;
  UC.themes=[...(UC.themes||[]),'corruption'];
  await dbUpdateUser(getU(),{themes:UC.themes});
  showSecretUnlock('corruption','You found the secret word...');
  renderShop();
}

function showSecretUnlock(id,hint){
  const msg=document.createElement('div');
  msg.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.92);animation:fadeInOut 4s ease forwards;pointer-events:none';
  msg.innerHTML=`<div style="font-family:'Bebas Neue',cursive;font-size:3rem;letter-spacing:6px;color:#ff2200;text-shadow:0 0 30px #ff0000,0 0 60px #ff0000;animation:glitchText .15s infinite">SECRET THEME UNLOCKED</div><div style="font-size:1.2rem;color:#fff;margin-top:14px;letter-spacing:3px">${hint}</div><div style="font-size:.85rem;color:rgba(255,255,255,.4);margin-top:8px;letter-spacing:2px">Check your shop!</div>`;
  document.body.appendChild(msg);
  setTimeout(()=>msg.remove(),4000);
}

// ── EASTER EGG SYSTEM ────────────────────────────────────────
let eggBuffer='', eggTimestamp=0;
const EGG_CODES = {
  'default': async ()=>{
    await grantCorruptionTheme();
  },
  'finnflexeshisdihtoalice': ()=>{
    showToast('🍆');
    confettiBlast('#ffd700');
  },
  'liquidtype': ()=>{
    showToast('🏁 You found the hidden cheer!');
    confettiBlast('#cc0000');
    for(let i=0;i<5;i++)setTimeout(()=>showToast('🏁'),i*400);
  },
  'konami': ()=>{
    if(UC){UC.coins=(UC.coins||0)+50;dbUpdateUser(getU(),{coins:UC.coins});refreshCoins();}
    showToast('🎮 Konami Code: +50 bottlecaps!');
  },
  'depouleisreal': ()=>{
    showToast('👁️ It sees you.');
  },
  'ggobsiscool': ()=>{
    if(UC){UC.coins=(UC.coins||0)+100;dbUpdateUser(getU(),{coins:UC.coins});refreshCoins();}
    showToast('🏆 Ggobs blesses you: +100 coins!');
  },
  'holographic': ()=>{
    showToast('✨ You see through the veil.');
    document.body.style.animation='holoShift 1s infinite';
    setTimeout(()=>document.body.style.animation='',5000);
  },
  'zerozero': ()=>{
    showToast("🔢 The void between numbers.");
    confettiBlast('#ffffff');
  },
};

function handleEasterEggInput(char){
  const now=Date.now();
  if(now-eggTimestamp>3000)eggBuffer='';
  eggTimestamp=now;
  eggBuffer=(eggBuffer+char.toLowerCase()).slice(-20);
  for(const code of Object.keys(EGG_CODES)){
    if(eggBuffer.endsWith(code)){
      eggBuffer='';
      EGG_CODES[code]();
      return;
    }
  }
}

document.addEventListener('keydown',(e)=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;
  if(e.key.length===1)handleEasterEggInput(e.key);
});

function confettiBlast(color){
  for(let i=0;i<40;i++){
    setTimeout(()=>{
      const p=document.createElement('div');
      p.style.cssText=`position:fixed;top:${Math.random()*100}vh;left:${Math.random()*100}vw;width:8px;height:8px;background:${color};border-radius:${Math.random()>0.5?'50%':'2px'};z-index:9990;pointer-events:none;animation:confettiFall ${0.8+Math.random()*1.2}s ease forwards;transform:rotate(${Math.random()*360}deg)`;
      document.body.appendChild(p);
      setTimeout(()=>p.remove(),2000);
    },i*40);
  }
}

// ── GLITCH OVERLAY ────────────────────────────────────────────
let glitchActive=false, glitchIv=null;
function triggerGlitch(duration=2000){
  if(glitchActive)return;
  glitchActive=true;
  const ov=document.getElementById('glitch-overlay');
  if(ov)ov.classList.add('on');
  document.body.classList.add('glitch-body');
  clearInterval(glitchIv);
  glitchIv=setInterval(()=>{
    if(ov){
      ov.style.transform=`translate(${(Math.random()-0.5)*8}px,${(Math.random()-0.5)*4}px)`;
      ov.style.opacity=(0.02+Math.random()*0.06).toString();
    }
    const clips=['inset(10% 0 85% 0)','inset(40% 0 50% 0)','inset(70% 0 15% 0)','inset(0)'];
    document.body.style.clipPath=Math.random()>0.85?clips[Math.floor(Math.random()*clips.length)]:'';
  },80);
  setTimeout(()=>{
    clearInterval(glitchIv);
    glitchActive=false;
    document.body.style.clipPath='';
    document.body.classList.remove('glitch-body');
    if(ov)ov.classList.remove('on');
  },duration);
}


// Secret theme color configurators stored per-user
async function setSecretThemeColor(themeId, colorKey, value){
  if(!UC)return;
  const key='stc_'+themeId;
  UC[key]=UC[key]||{};
  UC[key][colorKey]=value;
  await dbUpdateUser(getU(),{[key]:UC[key]});
  applySecretThemeColors(themeId);
}

function applySecretThemeColors(themeId){
  if(!UC)return;
  const key='stc_'+themeId;
  const colors=UC[key]||{};
  const r=document.documentElement.style;
  const defaults={
    glitch:     {c1:'#0d0000',c2:'#ff0000',c3:'#00ff00'},
    voidwalker: {c1:'#000000',c2:'#220033',c3:'#110022'},
    prismatic:  {c1:'#0a000f',c2:'#1a0030',c3:'#000a1a'},
    corruption: {c1:'#000000',c2:'#0a0000',c3:'#001400'},
  };
  const d=defaults[themeId]||{};
  r.setProperty('--st1',colors.c1||d.c1||'#000');
  r.setProperty('--st2',colors.c2||d.c2||'#111');
  r.setProperty('--st3',colors.c3||d.c3||'#222');
}


// ── SETTINGS ─────────────────────────────────────────────────
let settingsOpen=false;
const SETTINGS_DEFAULTS={music:false,effects:true,epilepsy:false};
function getSettings(){
  try{return{...SETTINGS_DEFAULTS,...JSON.parse(localStorage.getItem('lt_settings')||'{}')};}
  catch(e){return{...SETTINGS_DEFAULTS};}
}
function saveSetting(key,val){
  const s=getSettings();s[key]=val;
  localStorage.setItem('lt_settings',JSON.stringify(s));
}
function openSettings(){
  settingsOpen=true;
  document.getElementById('settings-overlay').classList.add('on');
  renderSettings();
}
function closeSettings(){
  settingsOpen=false;
  document.getElementById('settings-overlay').classList.remove('on');
}
function renderSettings(){
  const s=getSettings();
  const musicBtn=document.getElementById('st-music-btn');
  const effectsBtn=document.getElementById('st-effects-btn');
  const epilepsyBtn=document.getElementById('st-epilepsy-btn');
  if(musicBtn){musicBtn.textContent=s.music?'🔊 On':'🔇 Off';musicBtn.className='st-toggle'+(s.music?' on':'');}
  if(effectsBtn){effectsBtn.textContent=s.effects?'✅ On':'❌ Off';effectsBtn.className='st-toggle'+(s.effects?' on':'');}
  if(epilepsyBtn){epilepsyBtn.textContent=s.epilepsy?'⚡ Enabled':'💤 Disabled';epilepsyBtn.className='st-toggle'+(s.epilepsy?' warn':'');}
  applyEffectsSettings(s);
}
function toggleSetting(key){
  const s=getSettings();
  s[key]=!s[key];
  localStorage.setItem('lt_settings',JSON.stringify(s));
  renderSettings();
  if(key==='music')handleMusicToggle(s.music);
}
function applyEffectsSettings(s){
  if(!s.effects){
    document.body.classList.add('no-effects');
  } else {
    document.body.classList.remove('no-effects');
  }
  if(s.epilepsy){
    document.body.classList.add('epilepsy-mode');
  } else {
    document.body.classList.remove('epilepsy-mode');
  }
}

// ── BACKGROUND MUSIC ─────────────────────────────────────────
let bgMusic=null, musicStarted=false;
function handleMusicToggle(on){
  if(on){
    if(!bgMusic){
      bgMusic=new Audio();
      bgMusic.src='https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
      // We use a royalty-free energetic track. Replace URL with your own hosted track.
      bgMusic.loop=true;
      bgMusic.volume=0.25;
    }
    bgMusic.play().catch(()=>{});
    musicStarted=true;
  } else {
    if(bgMusic){bgMusic.pause();bgMusic.currentTime=0;}
  }
}
// Init music on first user interaction if setting is on
document.addEventListener('click',()=>{
  if(!musicStarted){
    const s=getSettings();
    if(s.music)handleMusicToggle(true);
  }
},{once:true});

// ── REDEEM CODES ─────────────────────────────────────────────
async function redeemCode(){
  const inp=document.getElementById('redeem-input');
  const code=(inp.value||'').trim().toUpperCase();
  if(!code){showToast('Enter a code.');return;}
  if(!FB_READY){showToast('Requires Firebase.');return;}
  const btn=document.getElementById('redeem-btn');
  btn.disabled=true; btn.textContent='Checking…';
  try{
    const doc=await db.collection('codes').doc(code).get();
    if(!doc.exists){showToast('❌ Invalid code.');btn.disabled=false;btn.textContent='Redeem';return;}
    const data=doc.data();
    if(data.used&&data.used.includes(getU())){
      showToast('You already redeemed this code.');btn.disabled=false;btn.textContent='Redeem';return;
    }
    if(data.maxUses&&(data.timesUsed||0)>=data.maxUses){
      showToast('This code has expired.');btn.disabled=false;btn.textContent='Redeem';return;
    }
    // Apply reward
    let msg='';
    if(data.type==='coins'||data.type==='bottlecaps'){
      UC.coins=(UC.coins||0)+data.amount;
      await dbUpdateUser(getU(),{coins:UC.coins});
      refreshCoins();
      msg=`🧢 +${data.amount} bottlecaps!`;
    } else if(data.type==='theme'){
      if(!(UC.themes||[]).includes(data.theme)){
        UC.themes=[...(UC.themes||[]),data.theme];
        await dbUpdateUser(getU(),{themes:UC.themes});
        renderShop();
        msg=`🎨 Theme unlocked: ${data.theme}!`;
      } else {
        msg='You already have that theme.';
      }
    } else if(data.type==='items'){
      UC.items=[...(UC.items||[]),...(data.items||[])];
      await dbUpdateUser(getU(),{items:UC.items});
      msg=`🎒 Item(s) granted!`;
    } else if(data.type==='badge'){
      await grantBadge(data.badgeId);
      msg=`🏅 Badge granted!`;
    }
    // Mark as used
    const used=[...(data.used||[]),getU()];
    await db.collection('codes').doc(code).update({used,timesUsed:(data.timesUsed||0)+1});
    inp.value='';
    if(code==='ALUCARD') await grantBadge('alucard');
    showToast('✅ Code redeemed! '+msg);
  } catch(e){
    console.error(e);
    showToast('Error redeeming code.');
  }
  btn.disabled=false; btn.textContent='Redeem';
}

// ── DEPOULE CODE CREATOR ─────────────────────────────────────
async function dpCreateCode(){
  if(!FB_READY){showToast('Requires Firebase.');return;}
  const codeVal=document.getElementById('dp-code-input').value.trim().toUpperCase();
  const typeVal=document.getElementById('dp-code-type').value;
  const amountVal=parseInt(document.getElementById('dp-code-amount').value)||0;
  const themeVal=document.getElementById('dp-code-theme').value.trim();
  const maxUses=parseInt(document.getElementById('dp-code-maxuses').value)||0;

  if(!codeVal){showToast('Enter a code name.');return;}
  if(typeVal==='coins'&&amountVal<=0){showToast('Enter an amount.');return;}
  if(typeVal==='theme'&&!themeVal){showToast('Enter a theme ID.');return;}

  const data={type:typeVal,used:[],timesUsed:0,createdAt:Date.now()};
  if(typeVal==='coins'||typeVal==='bottlecaps'){data.type='coins';data.amount=amountVal;}
  else if(typeVal==='theme'){data.theme=themeVal;}
  else if(typeVal==='items'){data.items=themeVal.split(',').map(s=>s.trim()).filter(Boolean);}
  else if(typeVal==='badge'){data.badgeId=themeVal;}
  if(maxUses>0)data.maxUses=maxUses;

  await db.collection('codes').doc(codeVal).set(data);
  showToast('✅ Code created: '+codeVal);
  document.getElementById('dp-code-input').value='';
  document.getElementById('dp-code-amount').value='';
  document.getElementById('dp-code-theme').value='';
  renderDPCodes();
}

async function renderDPCodes(){
  const el=document.getElementById('dp-codes-list');
  if(!el||!FB_READY)return;
  el.innerHTML='<div class="empty">Loading…</div>';
  const snap=await db.collection('codes').orderBy('createdAt','desc').limit(30).get();
  if(snap.empty){el.innerHTML='<div class="empty">No codes yet.</div>';return;}
  el.innerHTML=snap.docs.map(d=>{
    const c=d.data();
    const uses=c.timesUsed||0;
    const max=c.maxUses?`/${c.maxUses}`:'∞';
    const reward=c.type==='coins'?`🧢 ${c.amount} bottlecaps`:c.type==='theme'?`🎨 ${c.theme}`:c.type==='badge'?`🏅 badge:${c.badgeId}`:`🎒 items`;
    return `<div class="dp-code-row">
      <div class="dp-code-info"><span class="dp-code-name">${esc(d.id)}</span><span class="dp-code-reward">${reward}</span><span class="dp-code-uses">${uses}${max} uses</span></div>
      <button class="bsm del" onclick="dpDeleteCode('${esca(d.id)}')">🗑</button>
    </div>`;
  }).join('');
}

async function dpDeleteCode(id){
  if(!confirm('Delete code "'+id+'"?'))return;
  await db.collection('codes').doc(id).delete();
  showToast('Code deleted.');
  renderDPCodes();
}

// Apply settings on load
(()=>{const s=getSettings();applyEffectsSettings(s);})();

// ── BADGE SYSTEM ─────────────────────────────────────────────
const ALL_BADGES = [
  {id:'first_race',   icon:'🏁', name:'First Lap',      desc:'Complete your first race.',         secret:false},
  {id:'win_race',     icon:'🥇', name:'Winner',         desc:'Finish 1st place in a race.',       secret:false},
  {id:'streak3',      icon:'🔥', name:'On Fire',        desc:'Log in 3 days in a row.',           secret:false},
  {id:'streak7',      icon:'🔥🔥', name:'Inferno',      desc:'Log in 7 days in a row.',           secret:false},
  {id:'caps100',      icon:'🧢', name:'Pocket Change',  desc:'Earn 100 bottlecaps total.',        secret:false},
  {id:'caps1000',     icon:'💰', name:'Bottlecap Baron',desc:'Earn 1000 bottlecaps total.',       secret:false},
  {id:'caps5000',     icon:'👑', name:'Cap King',       desc:'Earn 5000 bottlecaps total.',       secret:false},
  {id:'themes5',      icon:'🎨', name:'Collector',      desc:'Own 5 themes.',                     secret:false},
  {id:'themes15',     icon:'🖼', name:'Connoisseur',    desc:'Own 15 themes.',                    secret:false},
  {id:'wpm80',        icon:'⚡', name:'Speed Typist',   desc:'Type at 80+ WPM.',                  secret:false},
  {id:'wpm100',       icon:'🚀', name:'Ludicrous Speed',desc:'Type at 100+ WPM.',                 secret:false},
  {id:'live_win',     icon:'🌐', name:'Net Champion',   desc:'Win a live race.',                  secret:false},
  {id:'gifter',       icon:'🎁', name:'Generous',       desc:'Gift bottlecaps to another player.',secret:false},
  {id:'reporter',     icon:'🚩', name:'Watchdog',       desc:'Submit a report.',                  secret:false},
  {id:'depoule_pet',  icon:'🐾', name:'Tamed',          desc:'Pet DePoule 50 times.',             secret:false},
  {id:'jackpot',      icon:'🎰', name:'Jackpot!',       desc:'Hit a DePoule jackpot.',            secret:false},
  // SECRET BADGES — hidden until unlocked
  {id:'alucard',      icon:'🧛', name:'ALUCARD',        desc:'???',                               secret:true},
  {id:'void_walker',  icon:'🌑', name:'Void Walker',    desc:'???',                               secret:true},
  {id:'depoule_chosen',icon:'🦆',name:'Chosen by DePoule',desc:'???',                            secret:true},
];

function hasBadge(id){return (UC&&(UC.badges||[])).includes(id);}

async function grantBadge(id){
  if(!UC||!FB_READY)return false;
  if(hasBadge(id))return false;
  UC.badges=[...(UC.badges||[]),id];
  await dbUpdateUser(getU(),{badges:UC.badges});
  const b=ALL_BADGES.find(x=>x.id===id);
  if(b){
    const n=document.createElement('div');
    n.style.cssText='position:fixed;bottom:70px;right:22px;z-index:9998;background:linear-gradient(135deg,rgba(15,0,0,.97),rgba(30,0,0,.97));border:1px solid #ffd700;border-radius:10px;padding:12px 18px;animation:tin .3s ease;pointer-events:none;box-shadow:0 0 20px rgba(255,215,0,.3)';
    n.innerHTML='<div style="font-size:.68rem;letter-spacing:2px;text-transform:uppercase;color:#ffd700;margin-bottom:4px">🏅 Badge Unlocked</div><div style="font-size:1rem;font-weight:700">'+(b.icon)+' '+esc(b.name)+'</div><div style="font-size:.75rem;color:rgba(255,255,255,.5);margin-top:2px">'+esc(b.desc)+'</div>';
    document.body.appendChild(n);
    setTimeout(()=>n.remove(),3500);
  }
  return true;
}

async function checkBadges(context){
  if(!UC||!FB_READY)return;
  const {wpm,place,isLive,coins,themes,streak,gifts,reports,pets,jackpot}=context;
  if(context.firstRace) await grantBadge('first_race');
  if(place===1&&!isLive) await grantBadge('win_race');
  if(place===1&&isLive) await grantBadge('live_win');
  if(streak>=3) await grantBadge('streak3');
  if(streak>=7) await grantBadge('streak7');
  if(wpm>=80) await grantBadge('wpm80');
  if(wpm>=100) await grantBadge('wpm100');
  const totalCoins=UC.coins||0;
  if(totalCoins>=100) await grantBadge('caps100');
  if(totalCoins>=1000) await grantBadge('caps1000');
  if(totalCoins>=5000) await grantBadge('caps5000');
  const themeCount=(UC.themes||[]).filter(t=>!['glitch','voidwalker','prismatic','corruption'].includes(t)).length;
  if(themeCount>=5) await grantBadge('themes5');
  if(themeCount>=15) await grantBadge('themes15');
  if(gifts) await grantBadge('gifter');
  if(reports) await grantBadge('reporter');
  if(pets&&(UC.totalPets||0)>=50) await grantBadge('depoule_pet');
  if(jackpot) await grantBadge('jackpot');
}

function openBadges(){
  document.getElementById('badges-overlay').classList.add('on');
  renderBadges();
}
function closeBadges(){
  document.getElementById('badges-overlay').classList.remove('on');
}

function renderBadges(){
  const el=document.getElementById('badges-grid');
  if(!el||!UC)return;
  const myBadges=UC.badges||[];
  const equipped=UC.equippedBadge||null;
  const visible=ALL_BADGES.filter(b=>!b.secret||myBadges.includes(b.id));
  el.innerHTML=visible.map(b=>{
    const owned=myBadges.includes(b.id);
    const isEquipped=equipped===b.id;
    if(!owned){
      return `<div class="badge-card locked">
        <div class="badge-icon">🔒</div>
        <div class="badge-name">Locked</div>
        <div class="badge-desc">${esc(b.desc==='???'?'Secret badge. Keep exploring...':b.desc)}</div>
      </div>`;
    }
    return `<div class="badge-card${isEquipped?' equipped':''}">
      <div class="badge-icon">${b.icon}</div>
      <div class="badge-name">${esc(b.name)}</div>
      <div class="badge-desc">${esc(b.desc)}</div>
      ${isEquipped
        ? `<button class="badge-equip-btn unequip" onclick="unequipBadge()">✗ Unequip</button>`
        : `<button class="badge-equip-btn equip" onclick="equipBadge('${b.id}')">Display</button>`
      }
    </div>`;
  }).join('');
}

async function equipBadge(id){
  if(!UC)return;
  UC.equippedBadge=id;
  await dbUpdateUser(getU(),{equippedBadge:id});
  renderBadges();
  showToast('Badge equipped to leaderboard!');
}
async function unequipBadge(){
  if(!UC)return;
  UC.equippedBadge=null;
  await dbUpdateUser(getU(),{equippedBadge:null});
  renderBadges();
  showToast('Badge removed from leaderboard.');
}


async function changePassword(){
  const cur=document.getElementById('cp-current').value;
  const newp=document.getElementById('cp-new').value;
  const conf=document.getElementById('cp-confirm').value;
  const msg=document.getElementById('cp-msg');
  msg.textContent='';
  if(!cur||!newp||!conf){msg.style.color='#f44';msg.textContent='Fill in all fields.';return;}
  if(newp.length<4){msg.style.color='#f44';msg.textContent='New password must be 4+ characters.';return;}
  if(newp!==conf){msg.style.color='#f44';msg.textContent='Passwords do not match.';return;}
  if(!UC||UC.password!==cur){msg.style.color='#f44';msg.textContent='Current password is wrong.';return;}
  await dbUpdateUser(getU(),{password:newp});
  UC.password=newp;
  msg.style.color='#00e676';
  msg.textContent='Password changed successfully!';
  document.getElementById('cp-current').value='';
  document.getElementById('cp-new').value='';
  document.getElementById('cp-confirm').value='';
}

// ── WORD FILTER ───────────────────────────────────────────────
let bannedWordsCache=[];
async function loadBannedWords(){
  if(!FB_READY)return;
  try{const doc=await db.collection('settings').doc('wordfilter').get();bannedWordsCache=doc.exists?(doc.data().words||[]):[];}catch(e){bannedWordsCache=[];}
}
function applyWordFilter(text){
  if(!bannedWordsCache.length)return text;
  let result=text;
  for(const word of bannedWordsCache){
    if(!word)continue;
    // Match word with optional non-alpha chars between each letter
    const escaped=word.split('').map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[^a-zA-Z0-9]*');
    try{result=result.replace(new RegExp(escaped,'gi'),'[MODERATED]');}catch(e){}
  }
  return result;
}
async function dpSaveBannedWords(){
  const raw=document.getElementById('dp-words-input').value;
  const words=raw.split('\n').map(w=>w.trim().toLowerCase()).filter(Boolean);
  if(!FB_READY){showToast('Requires Firebase.');return;}
  await db.collection('settings').doc('wordfilter').set({words});
  bannedWordsCache=words;
  showToast(`✅ Word filter saved (${words.length} word${words.length!==1?'s':''})`);
}
async function renderDPWordFilter(){
  const el=document.getElementById('dp-words-input');
  if(!el||!FB_READY)return;
  try{const doc=await db.collection('settings').doc('wordfilter').get();el.value=doc.exists?(doc.data().words||[]).join('\n'):'';}catch(e){}
}

// ── TROLL SYSTEM ─────────────────────────────────────────────
const TROLL_ACTIONS = [
  {id:'mute10',   icon:'🔇', label:'Mute for 10 mins',      cost:100, desc:'Silences them in chat & DMs for 10 minutes.'},
  {id:'theme',    icon:'🎨', label:'Force ugly theme',       cost:75,  desc:'Forces their theme to "Ash" (grey) for 5 minutes.'},
  {id:'slowmode', icon:'🐢', label:'TROLL VICTIM label',     cost:50,  desc:'Stamps (TROLL VICTIM) on their display name for 15 mins.'},
  {id:'confetti', icon:'🎉', label:'Spam confetti at them',  cost:30,  desc:'Sends them a surprise confetti popup notification.'},
  {id:'rename',   icon:'📛', label:'Give them a nickname',   cost:150, desc:'Adds a custom ALL-CAPS prefix to their name for 10 mins.'},
  {id:'forcemsg', icon:'💬', label:'Make them say something',cost:25,  desc:'Posts a message as them — shows (trolled) tag so everyone knows.'},
  {id:'flip',     icon:'🙃', label:'Flip their screen',      cost:60,  desc:'Turns their whole page upside-down for 20 seconds.'},
  {id:'shake',    icon:'💥', label:'Shake their screen',     cost:40,  desc:'Makes their screen violently shake for 15 seconds.'},
  {id:'jumpscare',icon:'👻', label:'Jumpscare',              cost:80,  desc:'Sends them a scary popup notification they have to dismiss.'},
  {id:'darkmode', icon:'🌑', label:'Force Void theme',       cost:70,  desc:'Forces their theme to Void (almost pitch black) for 5 mins.'},
];

let trollTarget=null;
function openTrollModal(username){
  if(!UC)return;
  trollTarget=username;
  document.getElementById('troll-overlay').classList.add('on');
  document.getElementById('troll-target-name').textContent=username;
  document.getElementById('troll-bal').textContent=UC.coins||0;
  const _ri=document.getElementById('troll-rename-inp'); if(_ri)_ri.value='';
  renderTrollActions();
}
function closeTrollModal(){
  document.getElementById('troll-overlay').classList.remove('on');
  trollTarget=null;
}
function renderTrollActions(){
  const el=document.getElementById('troll-actions-list');
  if(!el||!UC)return;
  el.innerHTML=TROLL_ACTIONS.map(a=>{
    const canAfford=(UC.coins||0)>=a.cost;
    const extra=a.id==='rename'?`<input id="troll-rename-inp" type="text" placeholder="Nickname (e.g. NOOB)" maxlength="12" style="width:100%;margin-top:6px;padding:6px 10px;background:var(--inp);border:1px solid rgba(255,255,255,.12);border-radius:5px;color:var(--text);font-family:'Rajdhani',sans-serif;font-size:.85rem;outline:none">`:a.id==='forcemsg'?`<input id="troll-forcemsg-inp" type="text" placeholder="Message to force (e.g. I love cheese)" maxlength="80" style="width:100%;margin-top:6px;padding:6px 10px;background:var(--inp);border:1px solid rgba(255,255,255,.12);border-radius:5px;color:var(--text);font-family:'Rajdhani',sans-serif;font-size:.85rem;outline:none">`:'';
    return `<div class="troll-action${canAfford?'':' cant-afford'}">
      <div class="troll-action-icon">${a.icon}</div>
      <div class="troll-action-info">
        <div class="troll-action-label">${a.label}</div>
        <div class="troll-action-desc">${a.desc}</div>
        ${extra}
      </div>
      <button class="troll-buy-btn" onclick="executeTroll('${a.id}')" ${canAfford?'':'disabled'}>🧢 ${a.cost}</button>
    </div>`;
  }).join('');
}

async function executeTroll(actionId){
  if(!UC||!trollTarget||!FB_READY)return;
  const action=TROLL_ACTIONS.find(a=>a.id===actionId);
  if(!action)return;
  if((UC.coins||0)<action.cost){showToast('Not enough bottlecaps!');return;}
  const target=await dbGetUser(trollTarget);
  if(!target){showToast('Player not found.');return;}

  // Deduct from troller
  UC.coins=(UC.coins||0)-action.cost;
  await dbUpdateUser(getU(),{coins:UC.coins});
  refreshCoins();

  const trolledBy=getU();
  const now=Date.now();
  let trollData={trolledBy,action:actionId,ts:now,msg:''};
  let toastMsg='';

  if(actionId==='mute10'){
    const unmuteAt=now+10*60*1000;
    await dbUpdateUser(trollTarget,{muted:true,trollMuted:true,trollMuteUntil:unmuteAt,trollNotif:{by:trolledBy,action:'muted you for 10 minutes',ts:now}});
    setTimeout(async()=>{
      const t=await dbGetUser(trollTarget);
      if(t&&t.trollMuted&&t.trollMuteUntil<=Date.now()){await dbUpdateUser(trollTarget,{muted:false,trollMuted:false});}
    },10*60*1000+5000);
    toastMsg=`🔇 ${trollTarget} muted for 10 mins!`;
  }
  else if(actionId==='theme'){
    const prev=target.activeTheme||'default';
    await dbUpdateUser(trollTarget,{activeTheme:'ash',trollTheme:true,trollThemeUntil:now+5*60*1000,trollThemePrev:prev,trollNotif:{by:trolledBy,action:'forced your theme to Ash',ts:now}});
    setTimeout(async()=>{
      const t=await dbGetUser(trollTarget);
      if(t&&t.trollTheme&&t.trollThemeUntil<=Date.now()){await dbUpdateUser(trollTarget,{activeTheme:t.trollThemePrev||'default',trollTheme:false});}
    },5*60*1000+5000);
    toastMsg=`🎨 Forced ${trollTarget}'s theme to Ash!`;
  }
  else if(actionId==='slowmode'){
    await dbUpdateUser(trollTarget,{trollLabel:'TROLL VICTIM',trollLabelUntil:now+15*60*1000,trollNotif:{by:trolledBy,action:'tagged you as TROLL VICTIM',ts:now}});
    setTimeout(async()=>{
      const t=await dbGetUser(trollTarget);
      if(t&&t.trollLabelUntil<=Date.now())await dbUpdateUser(trollTarget,{trollLabel:null});
    },15*60*1000+5000);
    toastMsg=`🐢 ${trollTarget} is now a TROLL VICTIM!`;
  }
  else if(actionId==='confetti'){
    await dbUpdateUser(trollTarget,{trollNotif:{by:trolledBy,action:'blasted confetti in your face 🎉',ts:now}});
    toastMsg=`🎉 Confetti sent to ${trollTarget}!`;
  }
  else if(actionId==='forcemsg'){
    const inp=document.getElementById('troll-forcemsg-inp');
    const forcedMsg=(inp?.value||'').trim();
    if(!forcedMsg){showToast('Enter a message to force.');return;}
    const trolledMsg=applyWordFilter(forcedMsg);
    // Post as the target but with a trolled marker
    await db.collection('messages').add({
      id:'m'+Date.now()+Math.random().toString(36).substr(2,4),
      username:trollTarget,text:trolledMsg,ts:Date.now(),edited:false,pinned:false,replyTo:null,trolled:true,trolledBy:trolledBy
    });
    await dbUpdateUser(trollTarget,{trollNotif:{by:trolledBy,action:`made you say: "${forcedMsg.slice(0,40)}"`,ts:now}});
    toastMsg=`💬 ${trollTarget} now says "${forcedMsg.slice(0,30)}"!`;
  }
  else if(actionId==='flip'){
    await dbUpdateUser(trollTarget,{trollFlip:true,trollFlipUntil:now+20000,trollNotif:{by:trolledBy,action:'flipped your screen upside-down',ts:now}});
    setTimeout(async()=>{const t=await dbGetUser(trollTarget);if(t?.trollFlip&&t.trollFlipUntil<=Date.now())await dbUpdateUser(trollTarget,{trollFlip:false});},25000);
    toastMsg=`🙃 ${trollTarget}'s screen flipped!`;
  }
  else if(actionId==='shake'){
    await dbUpdateUser(trollTarget,{trollShake:true,trollShakeUntil:now+15000,trollNotif:{by:trolledBy,action:'shook your screen like a snowglobe',ts:now}});
    setTimeout(async()=>{const t=await dbGetUser(trollTarget);if(t?.trollShake&&t.trollShakeUntil<=Date.now())await dbUpdateUser(trollTarget,{trollShake:false});},20000);
    toastMsg=`💥 ${trollTarget}'s screen is shaking!`;
  }
  else if(actionId==='jumpscare'){
    await dbUpdateUser(trollTarget,{trollNotif:{by:trolledBy,action:'Lil bro you have been jumpscared!',ts:now,jumpscare:true}});
    toastMsg=`👻 Jumpscare sent to ${trollTarget}!`;
  }
  else if(actionId==='darkmode'){
    const prev2=target.activeTheme||'default';
    await dbUpdateUser(trollTarget,{activeTheme:'void',trollTheme:true,trollThemeUntil:now+5*60*1000,trollThemePrev:prev2,trollNotif:{by:trolledBy,action:'forced your theme to pitch black Void',ts:now}});
    setTimeout(async()=>{const t=await dbGetUser(trollTarget);if(t?.trollTheme&&t.trollThemeUntil<=Date.now())await dbUpdateUser(trollTarget,{activeTheme:t.trollThemePrev||'default',trollTheme:false});},5*60*1000+5000);
    toastMsg=`🌑 ${trollTarget}'s screen went dark!`;
  }
  else if(actionId==='rename'){
    const nick=(document.getElementById('troll-rename-inp')||{}).value?.trim().toUpperCase()||'LOSER';
    const safeNick=nick.replace(/[^A-Z0-9]/g,'').slice(0,12)||'LOSER';
    await dbUpdateUser(trollTarget,{trollNick:safeNick,trollNickUntil:now+10*60*1000,trollNotif:{by:trolledBy,action:`gave you the nickname "${safeNick}"`,ts:now}});
    setTimeout(async()=>{
      const t=await dbGetUser(trollTarget);
      if(t&&t.trollNickUntil<=Date.now())await dbUpdateUser(trollTarget,{trollNick:null});
    },10*60*1000+5000);
    toastMsg=`📛 ${trollTarget} is now "${safeNick}"!`;
  }

  UC.coins=(UC.coins||0);
  document.getElementById('troll-bal').textContent=UC.coins;
  renderTrollActions();
  showToast(toastMsg);
}

// Check for troll notifications on login
async function checkTrollNotif(){
  if(!UC||!FB_READY)return;
  const notif=UC.trollNotif;
  if(!notif||!notif.ts)return;
  // Only show if recent (within last 5 mins)
  if(Date.now()-notif.ts>5*60*1000)return;
  // Clear it
  await dbUpdateUser(getU(),{trollNotif:null});
  // Show notification
  const n=document.createElement('div');
  n.style.cssText='position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:9999;background:linear-gradient(135deg,rgba(15,0,0,.97),rgba(30,0,0,.97));border:2px solid #cc0000;border-radius:12px;padding:18px 28px;max-width:380px;width:90%;text-align:center;box-shadow:0 0 30px rgba(200,0,0,.5);animation:trollNotifIn .4s ease';
  n.innerHTML=`<div style="font-size:1.5rem;margin-bottom:6px">🎭</div><div style="font-family:'Bebas Neue',cursive;font-size:1.2rem;letter-spacing:2px;color:#ff4444;margin-bottom:6px">YOU'VE BEEN TROLLED!</div><div style="font-size:.9rem;color:var(--text)"><b style="color:#ff8888">${esc(notif.by)}</b> ${esc(notif.action)}</div><button onclick="this.parentElement.remove()" style="margin-top:12px;padding:6px 18px;border:none;border-radius:6px;background:#cc0000;color:#fff;font-family:'Rajdhani',sans-serif;font-weight:700;cursor:pointer">OK 😤</button>`;
  document.body.appendChild(n);
}

// Check if UC has active troll effects and apply them
async function applyActiveTrollEffects(){
  if(!UC)return;
  const now=Date.now();
  // Forced theme
  if(UC.trollTheme&&UC.trollThemeUntil>now){
    document.body.className=document.body.className.replace(/theme-\S+/g,'').trim();
    document.body.classList.add('theme-ash');
  }
}


function startTrollEffectWatcher(){
  if(!FB_READY||!getU())return;
  // Live watch for troll effects applied to current user
  db.collection('users').doc(getU()).onSnapshot(doc=>{
    if(!doc.exists)return;
    const data=doc.data();
    const now=Date.now();
    // Flip effect
    if(data.trollFlip&&data.trollFlipUntil>now){
      document.body.style.transform='rotate(180deg)';
      document.body.style.transition='transform .5s';
      setTimeout(()=>{document.body.style.transform='';document.body.style.transition='';},data.trollFlipUntil-now);
    } else if(data.trollFlip){
      document.body.style.transform='';
    }
    // Shake effect
    if(data.trollShake&&data.trollShakeUntil>now){
      document.body.classList.add('troll-shake');
      setTimeout(()=>document.body.classList.remove('troll-shake'),data.trollShakeUntil-now);
    }
    // Theme force (reload theme if changed by troll)
    if(data.trollTheme&&data.trollThemeUntil>now){
      applyTheme(data.activeTheme||'default',data.gradientColors||null);
    }
    // Check for new notif
    if(data.trollNotif&&data.trollNotif.ts&&Date.now()-data.trollNotif.ts<30000){
      showTrollNotif(data.trollNotif);
    }
  });
}

function showTrollNotif(notif){
  // Prevent duplicate
  if(window._lastTrollNotifTs===notif.ts)return;
  window._lastTrollNotifTs=notif.ts;
  if(notif.jumpscare){
    const s=document.createElement('div');
    s.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.97);display:flex;flex-direction:column;align-items:center;justify-content:center;animation:jumpscareFlash .2s steps(1) 3';
    s.innerHTML=`<div style="font-size:8rem;animation:jumpscareGrow .4s ease">👻</div><div style="font-family:'Bebas Neue',cursive;font-size:3rem;letter-spacing:6px;color:#ff0000;text-shadow:0 0 30px #f00;animation:jumpscareGrow .3s ease">BOO!</div><div style="color:rgba(255,255,255,.6);margin-top:12px;font-size:1rem">${esc(notif.by)} jumpscared you</div><button onclick="this.parentElement.remove();dbUpdateUser(getU(),{trollNotif:null})" style="margin-top:20px;padding:10px 30px;border:none;border-radius:8px;background:#cc0000;color:#fff;font-family:'Rajdhani',sans-serif;font-size:1rem;font-weight:700;cursor:pointer">😤 OK</button>`;
    document.body.appendChild(s);
    return;
  }
  const n=document.createElement('div');
  n.style.cssText='position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:9999;background:linear-gradient(135deg,rgba(15,0,0,.97),rgba(30,0,0,.97));border:2px solid #cc0000;border-radius:12px;padding:18px 28px;max-width:380px;width:90%;text-align:center;box-shadow:0 0 30px rgba(200,0,0,.5);animation:trollNotifIn .4s ease';
  n.innerHTML=`<div style="font-size:1.5rem;margin-bottom:6px">🎭</div><div style="font-family:'Bebas Neue',cursive;font-size:1.2rem;letter-spacing:2px;color:#ff4444;margin-bottom:6px">YOU'VE BEEN TROLLED!</div><div style="font-size:.9rem;color:var(--text)"><b style="color:#ff8888">${esc(notif.by)}</b> ${esc(notif.action)}</div><button onclick="this.parentElement.remove();dbUpdateUser(getU(),{trollNotif:null})" style="margin-top:12px;padding:6px 18px;border:none;border-radius:6px;background:#cc0000;color:#fff;font-family:'Rajdhani',sans-serif;font-weight:700;cursor:pointer">OK 😤</button>`;
  document.body.appendChild(n);
}


// ── MODS SYSTEM ───────────────────────────────────────────────
let MOD_PW='finnflexeshisdihtoalice';
let modsOpen=false, activeMods=new Set();

const ALL_MODS=[
  {
    id:'litematica',
    icon:'🎨',
    name:'Litematica',
    desc:'Equip any theme without owning it. All themes show an "Equip" button in the shop regardless of ownership.',
    color:'#00ddff',
  },
  {
    id:'ventype',
    icon:'👁',
    name:'VenType',
    desc:'Ghost mode for chat. See original text before edits, see deleted messages (marked [DELETED]), and see edit/delete history on every message.',
    color:'#aa44ff',
  },
  {
    id:'xray',
    icon:'🔍',
    name:'XRay',
    desc:'Shows every user\'s join date, total message count, and last active time on their profile.',
    color:'#ff8800',
  },
  {
    id:'speedhack',
    icon:'⚡',
    name:'Delta',
    desc:'WPM counter updates every keystroke in real-time during races instead of every second.',
    color:'#00ff88',
  },
  {
    id:'richpresence',
    icon:'💎',
    name:'RPC',
    desc:'Shows a ✦ diamond icon next to your name in chat and leaderboard while active.',
    color:'#ffd700',
  },
  {
    id:'nightowl',
    icon:'🦉',
    name:'LowerBrightness',
    desc:'Dims the background by 40% and increases text contrast. Easier on the eyes at night.',
    color:'#8866ff',
  },
  {
    id:'chatspy',
    icon:'🕵',
    name:'TargetedChat',
    desc:'Highlights all messages from a specific user in chat. Click any username to lock onto them.',
    color:'#ff4488',
  },
  {
    id:'autocomplete',
    icon:'🤖',
    name:'AutoComplete',
    desc:'Tab key auto-completes the current word during a race.',
    color:'#44ffcc',
  },
  {id:'compact',icon:'📐',name:'CompactMode',desc:'Reduces padding and font sizes throughout the UI for a denser, more info-dense view.',color:'#aaaaaa'},
  {id:'timestamps',icon:'🕐',name:'FullTimestamps',desc:'Chat shows full date+time (Jan 15, 2:34 PM) instead of just the time.',color:'#88aaff'},
  {id:'chatbubbles',icon:'💬',name:'BubbleChat',desc:'Chat messages appear as rounded bubbles instead of flat rows. Your messages appear on the right.',color:'#ff88aa'},
  {id:'largetype',icon:'🔠',name:'LargeType',desc:'Increases all chat text to 1.15× size. Great for readability.',color:'#ffcc44'},
  {id:'smoothscroll',icon:'🌊',name:'SmoothScroll',desc:'Chat auto-scrolls smoothly to new messages with an animation instead of snapping.',color:'#44ddff'},
  {id:'mutedsounds',icon:'🔔',name:'PingSound',desc:'Plays a soft ping sound when a new chat message arrives.',color:'#88ff88'},
  {id:'rainbowname',icon:'🌈',name:'RainbowName',desc:'Your username in chat cycles through rainbow colors.',color:'#ff44ff'},
  {id:'hidejoins',icon:'👤',name:'HideOtherUsers',desc:'Only shows messages from yourself and one specific user. All others are hidden.',color:'#cc6600'},
  {id:'wordcount',icon:'📊',name:'WordCounter',desc:'Shows a live word count and estimated reading time on every chat message.',color:'#44ffaa'},
  {id:'fontmono',icon:'⌨',name:'MonoFont',desc:'Forces JetBrains Mono monospace font on all chat text.',color:'#cccccc'},
  {id:'invert',icon:'⬛',name:'InvertColors',desc:'Inverts the entire page color scheme. Great for accessibility.',color:'#ffffff'},
  {id:'blur_bg',icon:'🌫',name:'BlurBG',desc:'Adds a frosted glass blur effect to all cards and panels.',color:'#aaccff'},
  {id:'zoom',icon:'🔍',name:'UIZoom',desc:'Zooms the entire UI to 110% for easier reading on small screens.',color:'#ffaa88'},
  {id:'streakflame',icon:'🔥',name:'StreakFlame',desc:'Adds an animated fire emoji next to your streak count on the leaderboard.',color:'#ff6600'},
  {id:'hidechat',icon:'🙈',name:'FocusMode',desc:'Hides the chat tab entirely so you can focus on racing without distractions.',color:'#888888'},
  {id:'pingmention',icon:'📣',name:'Mentions',desc:'Highlights any chat message that contains your username in bright gold.',color:'#ffd700'},
  {id:'autorefresh',icon:'🔄',name:'AutoRefreshLB',desc:'Leaderboard automatically refreshes every 30 seconds.',color:'#44ffdd'},
  {id:'confettiwin',icon:'🎊',name:'WinConfetti',desc:'Triggers a confetti burst on your screen every time you finish 1st in a race.',color:'#ff88ff'},
  {id:'hidead',icon:'🚫',name:'CleanView',desc:'Removes visual noise: hides the MOTD bar, Discord button, and other nav clutter.',color:'#ff4444'},
  {id:'bigavatar',icon:'🅰',name:'BigAvatars',desc:'Makes chat avatars 48px instead of 32px for a more visual chat experience.',color:'#ffaa00'},
];

function openMods(){
  document.getElementById('mods-overlay').classList.add('on');
  document.getElementById('mods-pw').value='';
  document.getElementById('mods-err').textContent='';
  if(modsOpen)renderModsList();
}
function closeMods(){
  document.getElementById('mods-overlay').classList.remove('on');
}
function tryMods(){
  const v=document.getElementById('mods-pw').value;
  if(v===MOD_PW){
    modsOpen=true;
    document.getElementById('mods-lock').style.display='none';
    document.getElementById('mods-panel').classList.add('on');
    renderModsList();
  } else {
    document.getElementById('mods-err').textContent='Wrong password.';
  }
}

function renderModsList(){
  const el=document.getElementById('mods-list');
  if(!el)return;
  el.innerHTML=ALL_MODS.map(m=>{
    const on=activeMods.has(m.id);
    return `<div class="mod-card${on?' mod-on':''}">
      <div class="mod-icon" style="color:${m.color}">${m.icon}</div>
      <div class="mod-info">
        <div class="mod-name" style="color:${m.color}">${m.name}</div>
        <div class="mod-desc">${m.desc}</div>
      </div>
      <button class="mod-toggle-btn ${on?'on':'off'}" onclick="toggleMod('${m.id}')">${on?'✅ ON':'⬜ OFF'}</button>
    </div>`;
  }).join('');
  applyAllMods();
}

function toggleMod(id){
  if(activeMods.has(id)){
    activeMods.delete(id);
    deactivateMod(id);
  } else {
    activeMods.add(id);
    activateMod(id);
  }
  renderModsList();
  if(getU())dbUpdateUser(getU(),{activeMods:[...activeMods]});
}

function activateMod(id){
  const B=document.body;
  if(id==='litematica'){renderShop();}
  if(id==='nightowl'){B.classList.add('mod-nightowl');}
  if(id==='richpresence'){renderChat();renderLB();}
  if(id==='chatspy'){const u=prompt('Spy on username (blank=cancel):','');if(u)window._chatSpyTarget=u.trim();renderChat();}
  if(id==='ventype'){renderChat();}
  if(id==='compact'){B.classList.add('mod-compact');}
  if(id==='timestamps'){window._modFullTs=true;renderChat();}
  if(id==='chatbubbles'){B.classList.add('mod-bubbles');}
  if(id==='largetype'){B.classList.add('mod-largetype');}
  if(id==='smoothscroll'){window._modSmoothScroll=true;}
  if(id==='rainbowname'){B.classList.add('mod-rainbowname');renderChat();}
  if(id==='hidejoins'){const u=prompt('Only show messages from (leave blank=just yourself):','');window._modHideTarget=u?u.trim():getU();renderChat();}
  if(id==='wordcount'){renderChat();}
  if(id==='fontmono'){B.classList.add('mod-fontmono');}
  if(id==='invert'){B.classList.add('mod-invert');}
  if(id==='blur_bg'){B.classList.add('mod-blur-bg');}
  if(id==='zoom'){B.style.zoom='1.1';}
  if(id==='pingmention'){renderChat();}
  if(id==='autorefresh'){window._lbRefreshIv=setInterval(()=>renderLB(),30000);}
  if(id==='hidechat'){const c=document.querySelector('.ntab[onclick*="chat"]');if(c)c.style.display='none';}
  if(id==='bigavatar'){B.classList.add('mod-bigavatar');}
  if(id==='streakflame'){renderLB();}
  if(id==='hidead'){['#setup-banner'].forEach(s=>{const el=document.querySelector(s);if(el)el.style.display='none';});const disc=document.querySelector('.nbtn.dis');if(disc)disc.style.display='none';}
  if(id==='mutedsounds'){window._modPingEnabled=true;}
  if(id==='confettiwin'){window._modConfettiWin=true;}
}

function deactivateMod(id){
  const B=document.body;
  if(id==='litematica') renderShop();
  if(id==='nightowl'){B.classList.remove('mod-nightowl');}
  if(id==='richpresence'){renderChat();renderLB();}
  if(id==='chatspy'){window._chatSpyTarget=null;renderChat();}
  if(id==='ventype'){renderChat();}
  if(id==='compact'){B.classList.remove('mod-compact');}
  if(id==='timestamps'){window._modFullTs=false;renderChat();}
  if(id==='chatbubbles'){B.classList.remove('mod-bubbles');}
  if(id==='largetype'){B.classList.remove('mod-largetype');}
  if(id==='smoothscroll'){window._modSmoothScroll=false;}
  if(id==='rainbowname'){B.classList.remove('mod-rainbowname');renderChat();}
  if(id==='hidejoins'){window._modHideTarget=null;renderChat();}
  if(id==='wordcount'){renderChat();}
  if(id==='fontmono'){B.classList.remove('mod-fontmono');}
  if(id==='invert'){B.classList.remove('mod-invert');}
  if(id==='blur_bg'){B.classList.remove('mod-blur-bg');}
  if(id==='zoom'){B.style.zoom='';}
  if(id==='pingmention'){renderChat();}
  if(id==='autorefresh'){clearInterval(window._lbRefreshIv);}
  if(id==='hidechat'){const c=document.querySelector('.ntab[onclick*="chat"]');if(c)c.style.display='';}
  if(id==='bigavatar'){B.classList.remove('mod-bigavatar');}
  if(id==='streakflame'){renderLB();}
  if(id==='hidead'){['#setup-banner'].forEach(s=>{const el=document.querySelector(s);if(el)el.style.display='';});const disc=document.querySelector('.nbtn.dis');if(disc)disc.style.display='';}
  if(id==='mutedsounds'){window._modPingEnabled=false;}
  if(id==='confettiwin'){window._modConfettiWin=false;}
}

function applyAllMods(){
  if(activeMods.has('nightowl')) document.body.classList.add('mod-nightowl');
  else document.body.classList.remove('mod-nightowl');
}

// Litematica: patch renderShop to allow equipping any theme
const _origRenderShop = typeof renderShop !== 'undefined' ? renderShop : null;

// VenType: message history cache
const _msgHistory={};
function venTypeTrackEdit(id, oldText){
  if(!_msgHistory[id])_msgHistory[id]=[];
  _msgHistory[id].push({text:oldText,ts:Date.now()});
}
function venTypeTrackDelete(id, oldText){
  _msgHistory[id]=[...(_msgHistory[id]||[]),{text:oldText,deleted:true,ts:Date.now()}];
}

// Tab autocomplete mod
document.addEventListener('keydown',e=>{
  if(!activeMods.has('autocomplete'))return;
  if(e.key!=='Tab')return;
  const inp=document.getElementById('tinput');
  if(!inp||document.activeElement!==inp)return;
  e.preventDefault();
  if(!RS||!RS.prompt)return;
  const typed=inp.value;
  const words=RS.prompt.split(' ');
  let charCount=0;
  for(const w of words){
    if(typed.length>=charCount&&typed.length<=charCount+w.length){
      inp.value=RS.prompt.slice(0,charCount+w.length+1);
      return;
    }
    charCount+=w.length+1;
  }
});


// ── DP CUSTOM THEME PUBLISHER ─────────────────────────────────
let dpPublishedThemesCache = [];

const DP_THEME_ANIMATIONS = [
  {id:'none',   label:'None (static)'},
  {id:'pulse',  label:'Pulse glow'},
  {id:'wave',   label:'Color wave'},
  {id:'rainbow',label:'Rainbow shift'},
  {id:'glitch', label:'Glitch flicker'},
  {id:'breathe',label:'Breathe fade'},
  {id:'neon',   label:'Neon flicker'},
  {id:'aurora', label:'Aurora shimmer'},
];

async function dpPublishTheme() {
  if (!FB_READY) { showToast('Requires Firebase.'); return; }
  const name    = document.getElementById('dp-theme-name').value.trim();
  const desc    = document.getElementById('dp-theme-desc').value.trim() || 'A custom theme.';
  const price   = parseInt(document.getElementById('dp-theme-price').value) || 0;
  const bg1     = document.getElementById('dp-theme-bg1').value;
  const bg2     = document.getElementById('dp-theme-bg2').value;
  const bg3     = document.getElementById('dp-theme-bg3').value;
  const acc     = document.getElementById('dp-theme-acc').value;
  const acc2    = document.getElementById('dp-theme-acc2').value;
  const anim    = document.getElementById('dp-theme-anim').value;

  if (!name) { showToast('Enter a theme name.'); return; }

  const id = 'dp_' + name.toLowerCase().replace(/[^a-z0-9]/g,'_') + '_' + Date.now().toString(36);
  const themeData = { id, name, desc, price, bg1, bg2, bg3, acc, acc2, anim, published: true, createdAt: Date.now(), type: 'dptheme' };

  await db.collection('dpthemes').doc(id).set(themeData);
  showToast('✅ Theme "' + name + '" published!');
  dpPreviewTheme();

  // Clear inputs
  document.getElementById('dp-theme-name').value = '';
  document.getElementById('dp-theme-desc').value = '';
  document.getElementById('dp-theme-price').value = '100';
  renderDPPublishedThemes();
}

async function renderDPPublishedThemes() {
  const el = document.getElementById('dp-published-themes');
  if (!el || !FB_READY) return;
  el.innerHTML = '<div class="empty">Loading…</div>';
  const snap = await db.collection('dpthemes').orderBy('createdAt', 'desc').get();
  dpPublishedThemesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (!dpPublishedThemesCache.length) { el.innerHTML = '<div class="empty">No custom themes published yet.</div>'; return; }
  el.innerHTML = dpPublishedThemesCache.map(t => `
    <div class="dp-pub-theme" style="border-left:4px solid ${t.acc||'#888'}">
      <div style="font-weight:700;font-size:.9rem">${esc(t.name)}</div>
      <div style="font-size:.72rem;color:var(--muted)">${esc(t.desc)} · 💧${t.price} · anim:${t.anim||'none'}</div>
      <button class="bsm del" onclick="dpDeleteTheme('${esca(t.id)}')" style="margin-top:4px">🗑 Remove</button>
    </div>`).join('');
}

async function dpDeleteTheme(id) {
  if (!confirm('Remove this theme from the shop?')) return;
  await db.collection('dpthemes').doc(id).delete();
  showToast('Theme removed.');
  renderDPPublishedThemes();
  loadDPThemesIntoShop();
}

function dpPreviewTheme() {
  const bg1 = document.getElementById('dp-theme-bg1').value;
  const bg2 = document.getElementById('dp-theme-bg2').value;
  const bg3 = document.getElementById('dp-theme-bg3').value;
  const acc = document.getElementById('dp-theme-acc').value;
  const el  = document.getElementById('dp-theme-preview');
  if (el) el.style.background = `linear-gradient(135deg,${bg1},${bg2},${bg3})`;
  const dot = document.getElementById('dp-theme-acc-dot');
  if (dot) dot.style.background = acc;
}

// Load published themes into the shop
async function loadDPThemesIntoShop() {
  if (!FB_READY) return;
  try {
    const snap = await db.collection('dpthemes').orderBy('createdAt', 'desc').get();
    dpPublishedThemesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { return; }
  // Render them in the shop grid
  const grid = document.getElementById('sgrid');
  if (!grid || !UC) return;
  // Remove old dp theme cards
  grid.querySelectorAll('.dptheme-card').forEach(c => c.remove());
  dpPublishedThemesCache.forEach(t => {
    const owned = (UC.themes || []).includes(t.id);
    const active = UC.activeTheme === t.id;
    let act = '';
    if (active) act = `<div class="badge-on">Active</div><button class="towned">✓ Equipped</button>`;
    else if (owned || activeMods.has('litematica')) act = `<button class="tequip" onclick="equipDPTheme('${esca(t.id)}')">Equip</button>`;
    else act = `<div class="tprice">💧 ${t.price}</div><button class="tbuy" onclick="buyDPTheme('${esca(t.id)}',${t.price})" ${(UC.coins||0)<t.price?'disabled':''}>Buy & Equip</button>`;
    const div = document.createElement('div');
    div.className = 'tcard dptheme-card';
    div.innerHTML = `<div class="tprev" style="background:linear-gradient(135deg,${t.bg1},${t.bg2},${t.bg3});font-size:.7rem;letter-spacing:1px;color:${t.acc}">${esc(t.name)}</div><div class="tname">${esc(t.name)} <span style="font-size:.65rem;color:var(--muted)">custom</span></div><div class="tdesc">${esc(t.desc)}</div>${act}`;
    grid.appendChild(div);
  });
}

async function buyDPTheme(id, price) {
  if (!UC || (UC.coins||0) < price) { showToast('Not enough bottlecaps!'); return; }
  const themes = [...(UC.themes||[]), id];
  UC.coins -= price; UC.themes = themes; UC.activeTheme = id;
  await dbUpdateUser(getU(), {coins:UC.coins, themes, activeTheme:id});
  refreshCoins();
  applyDPTheme(id);
  loadDPThemesIntoShop();
  showToast('Theme unlocked! 🎉');
}

async function equipDPTheme(id) {
  if (!UC) return;
  UC.activeTheme = id;
  await dbUpdateUser(getU(), {activeTheme:id});
  applyDPTheme(id);
  loadDPThemesIntoShop();
  showToast('Theme equipped!');
}

function applyDPTheme(id) {
  const t = dpPublishedThemesCache.find(x => x.id === id);
  if (!t) return;
  const B = document.body;
  B.className = B.className.replace(/theme-\S+/g,'').trim();
  B.classList.add('theme-custom-gradient');
  // Apply colors via CSS vars
  const r = document.documentElement.style;
  r.setProperty('--cg1', t.bg1);
  r.setProperty('--cg2', t.bg2);
  r.setProperty('--cg3', t.bg3);
  r.setProperty('--cga', t.acc);
  r.setProperty('--cgb', t.acc2 || lghtn(t.acc, 20));
  r.setProperty('--cgc', lghtn(t.acc, 40));
  // Remove old dp-anim class
  B.classList.remove('dp-anim-pulse','dp-anim-wave','dp-anim-rainbow','dp-anim-glitch','dp-anim-breathe','dp-anim-neon','dp-anim-aurora');
  if (t.anim && t.anim !== 'none') B.classList.add('dp-anim-' + t.anim);
}


// ── APS PANEL ─────────────────────────────────────────────────
let APS_PW = 'depouleflexeshisdihtoalice';
let apsOpen = false;

// Load live passwords from Firebase
async function loadPanelPasswords() {
  if (!FB_READY) return;
  try {
    const doc = await db.collection('settings').doc('passwords').get();
    if (doc.exists) {
      const d = doc.data();
      if (d.admin) ADMIN_PW = d.admin;
      if (d.dp)    DP_PW    = d.dp;
      if (d.mgr)   MGR_PW   = d.mgr;
      if (d.mods)  MOD_PW   = d.mods;
      if (d.aps)   APS_PW   = d.aps;
    }
  } catch(e) { console.warn('Could not load panel passwords:', e); }
}

function openAPS() {
  document.getElementById('aps-overlay').classList.add('on');
  document.getElementById('aps-pw').value = '';
  document.getElementById('aps-err').textContent = '';
  if (apsOpen) renderAPS();
}
function closeAPS() {
  document.getElementById('aps-overlay').classList.remove('on');
}
function tryAPS() {
  const v = document.getElementById('aps-pw').value;
  if (v === APS_PW) {
    apsOpen = true;
    document.getElementById('aps-lock').style.display = 'none';
    document.getElementById('aps-panel').classList.add('on');
    renderAPS();
  } else {
    document.getElementById('aps-err').textContent = 'Wrong password.';
  }
}

function apsTab(id) {
  document.querySelectorAll('.aps-tab-btn').forEach(b => b.classList.toggle('on', b.dataset.tab === id));
  document.querySelectorAll('.aps-section').forEach(s => s.style.display = s.id === 'aps-sec-' + id ? 'block' : 'none');
  if (id === 'accounts') renderAPSAccounts();
  if (id === 'chat')     renderAPSChat();
  if (id === 'reports')  renderAPSReports();
  if (id === 'codes')    renderAPSCodes();
  if (id === 'words')    renderAPSWords();
  if (id === 'log')      renderAPSLog();
  if (id === 'pwds')     renderAPSPasswords();
}

async function renderAPS() {
  apsTab('accounts');
}

// ── Accounts ──
async function renderAPSAccounts() {
  const el = document.getElementById('aps-accounts');
  el.innerHTML = '<div class="empty">Loading…</div>';
  const accs = await dbAllUsers();
  if (!accs.length) { el.innerHTML = '<div class="empty">No accounts.</div>'; return; }
  el.innerHTML = accs.map(a => `
    <div class="aps-acc-row">
      <div class="aps-acc-name">${esc(a.username)} <span style="color:var(--muted);font-size:.75rem">${a.muted ? '🔇' : ''}</span></div>
      <div class="aps-acc-coins">🧢 ${a.coins || 0}</div>
      <div class="aps-acc-acts">
        <input class="coinamt" id="aps-ca-${esca(a.username)}" type="number" value="50" min="1" max="99999">
        <button class="bsm give" onclick="apsGive('${esca(a.username)}')">+Give</button>
        <button class="bsm take" onclick="apsTake('${esca(a.username)}')">-Take</button>
        <button class="bsm give" onclick="apsSetCoins('${esca(a.username)}')">= Set</button>
        <button class="bsm ${a.muted ? 'unmute' : 'mute'}" onclick="apsToggleMute('${esca(a.username)}')">${a.muted ? '🔈 Unmute' : '🔇 Mute'}</button>
        <button class="bsm give" onclick="apsResetStreak('${esca(a.username)}')">🔄 Streak</button>
        <button class="bsm del" onclick="apsDel('${esca(a.username)}')">🗑 Del</button>
      </div>
    </div>`).join('');
}

async function apsGive(u) { const amt=parseInt(document.getElementById('aps-ca-'+u).value)||0; if(amt<=0)return; const acc=await dbGetUser(u); if(!acc)return; await dbUpdateUser(u,{coins:(acc.coins||0)+amt}); if(u===getU())refreshCoins(); showToast(`+${amt} 🧢 → ${u}`); renderAPSAccounts(); }
async function apsTake(u) { const amt=parseInt(document.getElementById('aps-ca-'+u).value)||0; if(amt<=0)return; const acc=await dbGetUser(u); if(!acc)return; await dbUpdateUser(u,{coins:Math.max(0,(acc.coins||0)-amt)}); if(u===getU())refreshCoins(); showToast(`-${amt} 🧢 ← ${u}`); renderAPSAccounts(); }
async function apsSetCoins(u) { const amt=parseInt(document.getElementById('aps-ca-'+u).value)||0; if(amt<0)return; await dbUpdateUser(u,{coins:amt}); if(u===getU()){if(UC)UC.coins=amt;refreshCoins();} showToast(`Set ${u} coins to ${amt}`); renderAPSAccounts(); }
async function apsToggleMute(u) { const acc=await dbGetUser(u); if(!acc)return; await dbUpdateUser(u,{muted:!acc.muted}); showToast(!acc.muted?`🔇 ${u} muted`:`🔈 ${u} unmuted`); renderAPSAccounts(); }
async function apsResetStreak(u) { await dbUpdateUser(u,{streak:1,lastLoginDate:''}); showToast(`Streak reset for ${u}`); }
async function apsDel(u) { if(!confirm(`Delete "${u}"?`))return; await dbDeleteUser(u); if(u===getU()){doLogout();return;} showToast(`Deleted ${u}`); renderAPSAccounts(); }

// ── Chat ──
function renderAPSChat() {
  const el = document.getElementById('aps-chat');
  if (!chatCache.length) { el.innerHTML = '<div class="empty">No messages.</div>'; return; }
  el.innerHTML = chatCache.map(m => {
    const time = new Date(m.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    return `<div class="mcmsg">
      <div class="mcmsg-txt" style="flex:1">
        <span class="mcuser">${esc(m.username)}</span>
        <span style="color:var(--muted);font-size:.72rem">${time}</span><br>
        <span>${esc(m.text)}</span>
      </div>
      <div class="mcmsg-actions">
        <button class="bsm rm" onclick="apsDelMsg('${esca(m.id)}')">🗑 Del</button>
      </div>
    </div>`;
  }).join('');
}
async function apsDelMsg(id) { await dbDelMsg(id); renderAPSChat(); showToast('Deleted.'); }

// ── Reports ──
function renderAPSReports() {
  const el = document.getElementById('aps-reports');
  if (!FB_READY) { el.innerHTML = '<div class="empty">Requires Firebase.</div>'; return; }
  db.collection('reports').orderBy('ts','desc').limit(100).get().then(snap => {
    if (snap.empty) { el.innerHTML = '<div class="empty">No reports.</div>'; return; }
    el.innerHTML = snap.docs.map(d => {
      const r = d.data();
      const time = new Date(r.ts).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
      const sc = r.status==='punished'?'#ff4444':r.status==='forgiven'?'#00e676':'#ffd700';
      return `<div class="report-item">
        <div class="report-header">
          <span style="font-weight:700;color:var(--accent2)">🚩 ${esc(r.accused)}</span>
          <span style="color:var(--muted);font-size:.72rem"> — by ${esc(r.reporter)}</span>
          <span style="color:${sc};font-size:.72rem;font-weight:700;margin-left:8px">${r.status||'pending'}</span>
        </div>
        <div class="report-reason">${esc(r.reason)}</div>
        <div style="font-size:.68rem;color:var(--muted)">${time}</div>
        ${r.status==='pending'?`<div class="report-actions">
          <button class="bsm punish" onclick="reportPunish('${d.id}','${esca(r.accused)}')">⚡ Punish</button>
          <button class="bsm forgive" onclick="reportForgive('${d.id}')">✅ Forgive</button>
          <button class="bsm del" onclick="reportDismiss('${d.id}')">🗑 Dismiss</button>
        </div>`:''}
      </div>`;
    }).join('');
  });
}

// ── Codes ──
async function renderAPSCodes() {
  const el = document.getElementById('aps-codes');
  if (!FB_READY) { el.innerHTML = '<div class="empty">Requires Firebase.</div>'; return; }
  el.innerHTML = '<div class="empty">Loading…</div>';
  const snap = await db.collection('codes').orderBy('createdAt','desc').limit(50).get();
  if (snap.empty) { el.innerHTML = '<div class="empty">No codes yet.</div>'; return; }
  el.innerHTML = snap.docs.map(d => {
    const c = d.data();
    const reward = c.type==='coins'?`🧢 ${c.amount}`:c.type==='theme'?`🎨 ${c.theme}`:c.type==='badge'?`🏅 ${c.badgeId}`:'🎒 items';
    return `<div class="dp-code-row">
      <div class="dp-code-info"><span class="dp-code-name">${esc(d.id)}</span><span class="dp-code-reward">${reward}</span><span class="dp-code-uses">${c.timesUsed||0}/${c.maxUses||'∞'} uses</span></div>
      <button class="bsm del" onclick="apsDeleteCode('${esca(d.id)}')">🗑</button>
    </div>`;
  }).join('');
}
async function apsCreateCode() {
  const code = document.getElementById('aps-code-name').value.trim().toUpperCase();
  const type = document.getElementById('aps-code-type').value;
  const amt  = parseInt(document.getElementById('aps-code-amt').value)||0;
  const val  = document.getElementById('aps-code-val').value.trim();
  const max  = parseInt(document.getElementById('aps-code-max').value)||0;
  if (!code) { showToast('Enter a code name.'); return; }
  const data = {type, used:[], timesUsed:0, createdAt:Date.now()};
  if (type==='coins') { data.amount=amt; }
  else if (type==='theme') { data.theme=val; }
  else if (type==='badge') { data.badgeId=val; }
  if (max>0) data.maxUses=max;
  await db.collection('codes').doc(code).set(data);
  showToast('Code created: '+code);
  document.getElementById('aps-code-name').value='';
  renderAPSCodes();
}
async function apsDeleteCode(id) { if(!confirm('Delete "'+id+'"?'))return; await db.collection('codes').doc(id).delete(); showToast('Deleted.'); renderAPSCodes(); }

// ── Word Filter ──
async function renderAPSWords() {
  const el = document.getElementById('aps-words');
  if (!FB_READY) { el.innerHTML = '<div class="empty">Requires Firebase.</div>'; return; }
  try { const doc=await db.collection('settings').doc('wordfilter').get(); el.value=doc.exists?(doc.data().words||[]).join('\n'):''; } catch(e){}
}
async function apsWordFilterSave() {
  const words=document.getElementById('aps-words').value.split('\n').map(s=>s.trim().toLowerCase()).filter(Boolean);
  await db.collection('settings').doc('wordfilter').set({words});
  bannedWordsCache=words;
  showToast(`Word filter saved (${words.length} words)`);
}

// ── Update Log ──
async function renderAPSLog() {
  const el = document.getElementById('aps-log-list');
  el.innerHTML = '<div class="empty">Loading…</div>';
  await loadUpdateLog();
  if (!updateLogCache.length) { el.innerHTML = '<div class="empty">No entries yet.</div>'; return; }
  el.innerHTML = updateLogCache.map(u => `
    <div class="mgr-entry">
      <div class="mgr-entry-info"><span class="mgr-ver">v${esc(u.version)}</span><span class="mgr-date">${esc(u.dateRange||u.date||'')}</span></div>
      <div class="mgr-entry-actions">
        <button class="bsm edit" onclick="apsLogEdit('${esca(u.id)}')">✏ Edit</button>
        <button class="bsm del" onclick="apsLogDel('${esca(u.id)}')">🗑 Del</button>
      </div>
    </div>`).join('');
}
function apsLogNew() { apsShowLogForm(null); }
function apsLogEdit(id) { const e=updateLogCache.find(u=>u.id===id); if(e)apsShowLogForm(e); }
function apsShowLogForm(entry) {
  const f=document.getElementById('aps-log-form'); f.style.display='block';
  document.getElementById('aps-log-edit-id').value=entry?entry.id:'';
  document.getElementById('aps-log-v').value=entry?entry.version:'';
  document.getElementById('aps-log-date').value=entry?(entry.dateRange||entry.date||''):'';
  document.getElementById('aps-log-changes').value=entry?(entry.changes||[]).join('\n'):'';
}
async function apsLogSave() {
  const id=document.getElementById('aps-log-edit-id').value;
  const version=document.getElementById('aps-log-v').value.trim();
  const dateRange=document.getElementById('aps-log-date').value.trim();
  const changes=document.getElementById('aps-log-changes').value.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!version){showToast('Version required.');return;}
  const data={version,dateRange,changes};
  if(FB_READY){if(id){await db.collection('updatelog').doc(id).update(data);}else{const r=db.collection('updatelog').doc();await r.set({id:r.id,...data,createdAt:Date.now()});}}
  document.getElementById('aps-log-form').style.display='none';
  await loadUpdateLog(); renderAPSLog(); showToast('Saved ✓');
}
async function apsLogDel(id) { if(!confirm('Delete?'))return; if(FB_READY)await db.collection('updatelog').doc(id).delete(); await loadUpdateLog(); renderAPSLog(); showToast('Deleted.'); }

// ── Password Manager ──
function renderAPSPasswords() {
  document.getElementById('aps-pw-admin').value = ADMIN_PW;
  document.getElementById('aps-pw-dp').value    = DP_PW;
  document.getElementById('aps-pw-mgr').value   = MGR_PW;
  document.getElementById('aps-pw-mods').value  = MOD_PW;
  document.getElementById('aps-pw-aps').value   = APS_PW;
}
async function apsPasswordsSave() {
  const newAdmin = document.getElementById('aps-pw-admin').value.trim();
  const newDP    = document.getElementById('aps-pw-dp').value.trim();
  const newMgr   = document.getElementById('aps-pw-mgr').value.trim();
  const newMods  = document.getElementById('aps-pw-mods').value.trim();
  const newAps   = document.getElementById('aps-pw-aps').value.trim();
  if(!newAdmin||!newDP||!newMgr||!newMods||!newAps){showToast('No password can be blank.');return;}
  ADMIN_PW=newAdmin; DP_PW=newDP; MGR_PW=newMgr; MOD_PW=newMods; APS_PW=newAps;
  if(FB_READY) await db.collection('settings').doc('passwords').set({admin:newAdmin,dp:newDP,mgr:newMgr,mods:newMods,aps:newAps});
  showToast('✅ All passwords updated & saved to Firebase!');
}

// ── DEPOULE UPGRADES SYSTEM ────────────────────────────────────
const DP_UPGRADES = [
  // Jackpot tree
  {id:'jp1', name:'Jackpot Boost I',      icon:'🎰', cost:500,  tier:1,          desc:'Jackpot reward +5 (10 → 15)',                  category:'jackpot'},
  {id:'jp2', name:'Jackpot Boost II',     icon:'🎰', cost:1200, tier:2, req:'jp1', desc:'Jackpot reward +10 more (→ 25)',              category:'jackpot'},
  {id:'jp3', name:'Jackpot Mega',         icon:'💎', cost:3000, tier:3, req:'jp2', desc:'Jackpot reward +20 more (→ 45)',              category:'jackpot'},
  // Jackpot frequency
  {id:'cm1', name:'Combo Master I',       icon:'⚡', cost:800,  tier:1,          desc:'Jackpot every 8 combo (was 10)',               category:'combo'},
  {id:'cm2', name:'Combo Master II',      icon:'⚡', cost:2000, tier:2, req:'cm1', desc:'Jackpot every 6 combo',                      category:'combo'},
  {id:'cm_mult', name:'Multiplier Boost', icon:'✖️', cost:900,  tier:1,          desc:'+1 to all combo coin multipliers',             category:'combo'},
  // Green chance tree
  {id:'gf1', name:'Green Favor I',        icon:'🟢', cost:600,  tier:1,          desc:'Red button chance −10% (50% → 40%)',          category:'luck'},
  {id:'gf2', name:'Green Favor II',       icon:'🟢', cost:1400, tier:2, req:'gf1', desc:'Red chance −20% total (→ 30%)',             category:'luck'},
  {id:'gf3', name:'Lucky Paws',           icon:'🍀', cost:3500, tier:3, req:'gf2', desc:'Red chance −35% total (→ 15%)',             category:'luck'},
  // Base earn
  {id:'be1', name:'Lucky Touch',          icon:'✨', cost:700,  tier:1,          desc:'+1 coin on every successful pet',              category:'earn'},
  {id:'be2', name:'Golden Paw',           icon:'🏆', cost:1800, tier:2, req:'be1', desc:'+2 coins on every win (stacks with above)', category:'earn'},
  // Loss protection
  {id:'ls1', name:'Loss Shield I',        icon:'🛡', cost:650,  tier:1,          desc:'Big punishment every 7 losses (was 5)',       category:'shield'},
  {id:'ls2', name:'Loss Shield II',       icon:'🛡', cost:1600, tier:2, req:'ls1', desc:'Big punishment every 10 losses',            category:'shield'},
  {id:'ls3', name:'Immunity',             icon:'💪', cost:4000, tier:3, req:'ls2', desc:'Big punishments completely disabled',       category:'shield'},
  // Rage resistance
  {id:'rr1', name:'Rage Resistance I',    icon:'😤', cost:900,  tier:1,          desc:'Rage mode red chance 65% (was 75%)',          category:'rage'},
  {id:'rr2', name:'Rage Resistance II',   icon:'😤', cost:2200, tier:2, req:'rr1', desc:'Rage mode red chance 55%',                  category:'rage'},
  // Speed
  {id:'sp1', name:'Quick Hands',          icon:'⏩', cost:750,  tier:1,          desc:'Pet cooldown 50% faster',                     category:'speed'},
  // Permanent discount
  {id:'dc1', name:'Duck Favor I',         icon:'🦆', cost:1000, tier:1,          desc:'Permanent 5% theme shop discount',            category:'discount'},
  {id:'dc2', name:'Duck Favor II',        icon:'🦆', cost:2500, tier:2, req:'dc1', desc:'Permanent 12% theme shop discount',         category:'discount'},
  {id:'dc3', name:'Duck Blessing',        icon:'🦆', cost:5000, tier:3, req:'dc2', desc:'Permanent 20% theme shop discount',         category:'discount'},
];

function dpHasUpgrade(id) {
  return UC && (UC.dpUpgrades||[]).includes(id);
}

function getDPPermanentDiscount() {
  if(dpHasUpgrade('dc3')) return 20;
  if(dpHasUpgrade('dc2')) return 12;
  if(dpHasUpgrade('dc1')) return 5;
  return 0;
}

function getDPStreakDiscount() {
  // Every 50 consecutive good pets = 10% discount, max 30%
  const tier=Math.min(3, Math.floor((petState.goodPetStreak||0)/50));
  return tier*10;
}

function getTotalDiscount() {
  return Math.min(50, getDPPermanentDiscount() + getDPStreakDiscount());
}

function getDiscountedPrice(price) {
  const disc=getTotalDiscount();
  if(!disc||!price) return price;
  return Math.max(1, Math.round(price * (1 - disc/100)));
}

function updateStreakBar() {
  const streak=petState.goodPetStreak||0;
  const nextMilestone=Math.ceil((streak+1)/50)*50;
  const prev=(Math.floor(streak/50))*50;
  const progress=streak===0?0:((streak-prev)/(50))*100;
  const bar=document.getElementById('dpg-streak-bar');
  const lbl=document.getElementById('dpg-streak-label');
  const badge=document.getElementById('dpg-discount-badge');
  const discInfo=document.getElementById('dpg-discount-info');
  if(bar) bar.style.width=Math.min(100,progress)+'%';
  if(lbl) lbl.textContent=streak+' / '+nextMilestone+' consecutive good pets';
  const streakDisc=getDPStreakDiscount();
  const permDisc=getDPPermanentDiscount();
  const total=getTotalDiscount();
  if(badge) badge.textContent=total>0?total+'% discount active!':'';
  if(discInfo){
    const parts=[];
    if(permDisc>0) parts.push('🦆 Permanent: '+permDisc+'%');
    if(streakDisc>0) parts.push('🐾 Streak: '+streakDisc+'%');
    discInfo.textContent=parts.length?'Shop discount: '+parts.join(' + '):'Pet DePoule for shop discounts!';
  }
}

// ── DePoule Game Modal ─────────────────────────────────────────
function openDPGame() {
  document.getElementById('dpg-overlay').classList.add('on');
  initPetBtn();
  updateStreakBar();
  dpgTab('pet');
}
function closeDPGame() {
  document.getElementById('dpg-overlay').classList.remove('on');
}
function dpgTab(id) {
  document.querySelectorAll('.dpg-tab-btn').forEach(b=>b.classList.toggle('on',b.dataset.tab===id));
  document.querySelectorAll('.dpg-section').forEach(s=>s.style.display='none');
  const sec=document.getElementById('dpg-sec-'+id);
  if(sec) sec.style.display='block';
  if(id==='upgrades') renderDPUpgrades();
  if(id==='stats') renderDPStats();
}

function renderDPUpgrades() {
  const el=document.getElementById('dpg-upgrades-list');
  if(!el||!UC) return;
  const myUpgrades=UC.dpUpgrades||[];
  const balance=UC.coins||0;

  // Group by category
  const cats={jackpot:'🎰 Jackpot',combo:'⚡ Combo',luck:'🟢 Luck',earn:'💰 Earnings',shield:'🛡 Loss Shield',rage:'😤 Rage Resist',speed:'⏩ Speed',discount:'🦆 Shop Discount'};
  const grouped={};
  DP_UPGRADES.forEach(u=>{if(!grouped[u.category])grouped[u.category]=[];grouped[u.category].push(u);});

  el.innerHTML=Object.keys(cats).map(cat=>{
    const upgrades=grouped[cat]||[];
    return `<div class="dpg-upgrade-cat">
      <div class="dpg-cat-title">${cats[cat]}</div>
      <div class="dpg-cat-items">
        ${upgrades.map(u=>{
          const owned=myUpgrades.includes(u.id);
          const reqMet=!u.req||myUpgrades.includes(u.req);
          const canAfford=balance>=u.cost;
          const locked=!reqMet;
          return `<div class="dpg-upgrade-card${owned?' owned':locked?' locked':''}">
            <div class="dpg-upg-icon">${u.icon}</div>
            <div class="dpg-upg-body">
              <div class="dpg-upg-name">${u.name} <span class="dpg-upg-tier">T${u.tier}</span>${u.req?`<span class="dpg-upg-req">requires ${DP_UPGRADES.find(x=>x.id===u.req)?.name||u.req}</span>`:''}</div>
              <div class="dpg-upg-desc">${u.desc}</div>
            </div>
            <div class="dpg-upg-right">
              ${owned
                ? `<div class="dpg-upg-owned">✅ Owned</div>`
                : locked
                  ? `<div class="dpg-upg-locked">🔒 Locked</div>`
                  : `<button class="dpg-upg-buy ${canAfford?'':'cant'}" onclick="buyDPUpgrade('${u.id}')" ${canAfford?'':'disabled'}>🧢 ${u.cost}</button>`
              }
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

async function buyDPUpgrade(id) {
  if(!UC||!FB_READY) return;
  const upg=DP_UPGRADES.find(u=>u.id===id);
  if(!upg) return;
  if((UC.coins||0)<upg.cost){showToast('Not enough bottlecaps!');return;}
  if(upg.req&&!(UC.dpUpgrades||[]).includes(upg.req)){showToast('Unlock the required upgrade first!');return;}
  if((UC.dpUpgrades||[]).includes(id)){showToast('Already owned!');return;}
  UC.coins-=upg.cost;
  UC.dpUpgrades=[...(UC.dpUpgrades||[]),id];
  await dbUpdateUser(getU(),{coins:UC.coins,dpUpgrades:UC.dpUpgrades});
  refreshCoins();
  renderDPUpgrades();
  updateStreakBar();
  showToast(`✅ ${upg.name} unlocked! ${upg.desc}`);
}

function renderDPStats() {
  const el=document.getElementById('dpg-stats-content');
  if(!el||!UC) return;
  const myUpgrades=UC.dpUpgrades||[];
  const totalPets=UC.totalPets||0;
  const permDisc=getDPPermanentDiscount();
  const streakDisc=getDPStreakDiscount();
  const total=getTotalDiscount();
  el.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div class="dpg-stat-card"><div class="dpg-stat-val">${totalPets}</div><div class="dpg-stat-lbl">Total Pets (all time)</div></div>
      <div class="dpg-stat-card"><div class="dpg-stat-val">${petState.pets}</div><div class="dpg-stat-lbl">Pets This Session</div></div>
      <div class="dpg-stat-card"><div class="dpg-stat-val" style="color:#00e676">${petState.wins}</div><div class="dpg-stat-lbl">Session Wins</div></div>
      <div class="dpg-stat-card"><div class="dpg-stat-val" style="color:#ff4444">${petState.losses}</div><div class="dpg-stat-lbl">Session Losses</div></div>
      <div class="dpg-stat-card"><div class="dpg-stat-val" style="color:#ffaa44">${petState.goodPetStreak}</div><div class="dpg-stat-lbl">Current Good Streak</div></div>
      <div class="dpg-stat-card"><div class="dpg-stat-val" style="color:#00e676">${total>0?total+'%':'None'}</div><div class="dpg-stat-lbl">Active Shop Discount</div></div>
    </div>
    <div style="padding:10px 14px;background:rgba(255,170,0,.06);border:1px solid rgba(255,170,0,.15);border-radius:9px;margin-bottom:12px">
      <div style="font-size:.8rem;font-weight:700;color:#ffaa44;margin-bottom:8px">🦆 Current Discount Breakdown</div>
      <div style="font-size:.82rem;color:var(--muted)">Permanent (upgrades): <span style="color:#00e676">${permDisc}%</span></div>
      <div style="font-size:.82rem;color:var(--muted)">Streak bonus: <span style="color:#00e676">${streakDisc}%</span> (${petState.goodPetStreak} consecutive good pets)</div>
      <div style="font-size:.82rem;color:var(--text);margin-top:4px;font-weight:700">Total: ${total}% (max 50%)</div>
    </div>
    <div style="padding:10px 14px;background:rgba(100,0,200,.05);border:1px solid rgba(100,0,200,.12);border-radius:9px">
      <div style="font-size:.8rem;font-weight:700;color:#aa77ff;margin-bottom:8px">⬆ Upgrades Owned (${myUpgrades.length} / ${DP_UPGRADES.length})</div>
      ${myUpgrades.length?myUpgrades.map(id=>{const u=DP_UPGRADES.find(x=>x.id===id);return u?`<div style="font-size:.8rem;color:var(--muted);margin-bottom:3px">${u.icon} ${u.name}</div>`:''}).join(''):'<div style="color:var(--muted);font-size:.82rem">No upgrades yet — buy some!</div>'}
    </div>
  `;
}

// Close dpg-overlay on outside click
document.addEventListener('DOMContentLoaded',()=>{
  const ov=document.getElementById('dpg-overlay');
  if(ov)ov.addEventListener('click',function(e){if(e.target===this)closeDPGame();});
});

function showWelcomeScreen() {
  const ld = document.getElementById('loading');
  const au = document.getElementById('auth');
  const ws = document.getElementById('welcome-screen');
  
  if (ld) ld.style.display = 'none';
  if (au) au.style.display = 'none';
  if (ws) ws.style.display = 'flex';
}

function startFromWelcome(mode) {
  document.getElementById('welcome-screen').style.display = 'none';
  document.getElementById('auth').style.display = 'flex';
  switchAuth(mode);
}

async function init() {
  const setStatus = (msg) => { const el = document.getElementById('ld-status'); if(el) el.textContent = msg; };
  
  try {
    initFB();
    await loadPanelPasswords();
    gmPreview();

    const cur = getU();
    if (cur) {
      setStatus('Checking session...');
      const acc = await dbGetUser(cur);
      if (acc) {
        UC = { ...acc };
        setStatus('Ready.');
        startLoadingSequence(true);
        return;
      } else {
        setU(null);
      }
    }
  } catch (e) {
    console.error("Initialization failed:", e);
    setStatus("Error starting engine.");
  }
  
  showWelcomeScreen();
}
init();
