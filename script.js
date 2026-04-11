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
      chatCache=s.docs.map(d=>d.data()); renderChat();
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
  if (FB_READY) { await db.collection('messages').doc(id).delete(); return; }
  chatCache=chatCache.filter(m=>m.id!==id); localStorage.setItem('lt_chat',JSON.stringify(chatCache)); renderChat(); if(admOpen)renderAdmChat(); if(dpOpen)renderDPChat();
}
async function dbEditMsg(id, newText) {
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
  if(!acc||acc.password!==p){msg.className='amsg err';msg.textContent='Wrong username or password.';btn.disabled=false;btn.textContent='Enter The Race';return;}
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
  document.getElementById('app').style.display='none';
  document.getElementById('auth').style.display='flex';
  document.getElementById('li-btn').disabled=false; document.getElementById('li-btn').textContent='Enter The Race';
  document.getElementById('re-btn').disabled=false; document.getElementById('re-btn').textContent='Create Account';
  document.getElementById('li-msg').textContent='';
  resetRace(); applyTheme('default',null);
}
function enterApp() {
  document.getElementById('auth').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('nav-user').textContent=UC.username;
  refreshCoins(); applyTheme(UC.activeTheme||'default',UC.gradientColors||null);
  renderShop(); startChatListener(); renderLB();
}

// ── NAV ────────────────────────────────────────────────
function goTab(id) {
  document.querySelectorAll('.ntab').forEach((t,i)=>t.classList.toggle('on',['race','shop','chat','lb'][i]===id));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
  document.getElementById('tab-'+id).classList.add('on');
  if(id==='shop'){renderShop();initPetBtn();}
  if(id==='chat')setTimeout(scrollMsgs,50);
  if(id==='lb')renderLB();
}
function refreshCoins() {
  const c=UC?(UC.coins||0):0;
  document.getElementById('coin-count').textContent=c;
  document.getElementById('shop-coins').textContent=c;
}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function esca(s){return String(s).replace(/'/g,"\\'")}

// ── SOLO RACE ENGINE ────────────────────────────────────
const PROMPTS=[
  "Falice is the perfect combonation!",
  "FREEDOM!!!!!",
  "I-- i- uhh i uhh- fogo- my lin- plea-",
  ";)",
  "DOODLEHONEYOWNSTHESKY",
  "Im in the thick of it everybody knows, They know me where it snows I skate in and they froze.",
  "Sad Music (()()()()()()()",
  "If scripting is your power then what are you without it?",
  "Freed or Jeed. Hmm idk dawg.",
  "The wind whispers Pancakes in my ears",
  "JOE BIDEN'S SONE",
  "Depoule Depoule Depoule Depoule Depoule Depoule Depoule Depoule Depoule Depoule Depoule Depoule Depoule Depoule Depoule Depoule "
];
const BOT_NAMES=['Ytggobs','TheFinnyShow','Doodlehoney2018','Marco'];
const COIN_REWARDS=[50,30,15,5];
const PLABELS=['1ST','2ND','3RD','4TH'];
const PCSS=['p1','p2','p3','p4'];

let RS={active:false,prompt:'',typed:'',startTime:null,endTime:null,bots:[],botIvs:[],timerIv:null,finished:false,finishOrder:[],errors:0,mode:'solo'};
let lastLen=0;

function startSolo() {
  if(RS.active||liveRS.searching||liveRS.active)return;
  RS={active:false,prompt:PROMPTS[Math.floor(Math.random()*PROMPTS.length)],typed:'',startTime:null,endTime:null,
    bots:BOT_NAMES.map(n=>({name:n,wpm:Math.floor(Math.random()*36)+45,progress:0,finished:false,finishTime:null,expectedMs:0})),
    botIvs:[],timerIv:null,finished:false,finishOrder:[],errors:0,mode:'solo'};
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
  const coins=COIN_REWARDS[Math.min(place-1,3)];
  if(UC){UC.coins=(UC.coins||0)+coins;await dbUpdateUser(getU(),{coins:UC.coins});refreshCoins();}
  showResult(place,coins,wpm,acc,elapsed);
}

function showResult(place,coins,wpm,acc,elapsed) {
  const el=document.getElementById('r-place');
  el.textContent=PLABELS[Math.min(place-1,3)]; el.className='rplace '+PCSS[Math.min(place-1,3)];
  document.getElementById('r-coins').textContent='+'+coins+' 🪙';
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
  inp.addEventListener('input',e=>{
    if((!RS.active&&!liveRS.active)||RS.finished)return;
    const val=e.target.value, prompt=RS.prompt;
    if(val.length>lastLen+1){e.target.value=val.slice(0,lastLen+1);lastLen=e.target.value.length;return;}
    lastLen=val.length;
    let errs=0; for(let i=0;i<val.length;i++){if(i>=prompt.length||val[i]!==prompt[i])errs++;}
    RS.errors=errs;
    document.getElementById('s-acc').textContent=Math.max(0,val.length?Math.round(((val.length-errs)/val.length)*100):100)+'%';
    RS.typed=val; renderPromptText();
    const pct=Math.min(100,Math.round((val.length/prompt.length)*100));
    const bar=document.getElementById('bar-you');
    if(bar){bar.style.width=pct+'%';document.getElementById('pct-you').textContent=pct+'%';}
    if(val===prompt){
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
  const coins=place===1?75:20;
  if(UC){UC.coins=(UC.coins||0)+coins;await dbUpdateUser(getU(),{coins:UC.coins});refreshCoins();}
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
  {id:'custom',name:'Custom Gradient',desc:'Design your own colors.',price:300,prev:'prev-custom'},
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
    else if(owned) act=`<button class="tequip" onclick="equipTheme('${t.id}')">Equip</button>`;
    else if(t.price===0) act=`<div class="badge-free">Free</div><button class="tequip" onclick="equipTheme('${t.id}')">Equip</button>`;
    else act=`<div class="tprice">🪙 ${t.price}</div><button class="tbuy" onclick="buyTheme('${t.id}',${t.price})" ${(acc.coins||0)<t.price?'disabled':''}>Buy & Equip</button>`;
    grid.innerHTML+=`<div class="tcard"><div class="tprev ${t.prev}">${t.name}</div><div class="tname">${t.name}</div><div class="tdesc">${t.desc}</div>${act}</div>`;
  });
  if((acc.themes||[]).includes('custom')&&acc.activeTheme==='custom'){gm.classList.add('on');if(acc.gradientColors){document.getElementById('gm1').value=acc.gradientColors.c1||'#001a2e';document.getElementById('gm2').value=acc.gradientColors.c2||'#002b4d';document.getElementById('gm3').value=acc.gradientColors.c3||'#003d6b';document.getElementById('gma').value=acc.gradientColors.ca||'#00c8ff';gmPreview();}}
  else gm.classList.remove('on');
}

async function buyTheme(id,price){
  if(!UC||(UC.coins||0)<price){showToast('Not enough coins!');return;}
  const themes=[...(UC.themes||[]),id];
  UC.coins-=price; UC.themes=themes; UC.activeTheme=id;
  await dbUpdateUser(getU(),{coins:UC.coins,themes,activeTheme:id});
  applyTheme(id,UC.gradientColors); refreshCoins(); renderShop();
  if(id==='custom')document.getElementById('gmbox').classList.add('on');
  showToast('Theme unlocked! 🎉');
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
    candy:'theme-candy',infrared:'theme-infrared',custom:'theme-custom-gradient'
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
  if(!text||!getU())return;
  inp.value='';
  await dbAddMsg({id:'m'+Date.now()+Math.random().toString(36).substr(2,4),username:getU(),text,ts:Date.now(),edited:false});
  if(!FB_READY)scrollMsgs();
}
function renderChat(){
  const el=document.getElementById('msgs');
  if(!chatCache.length){el.innerHTML='<div class="empty">No messages yet. Say hello! 👋</div>';return;}
  const atBot=el.scrollHeight-el.scrollTop-el.clientHeight<70;
  const me=getU();
  el.innerHTML=chatCache.map(m=>{
    const isOwn=m.username===me;
    const editedTag=m.edited?'<span class="edited-tag">(edited)</span>':'';
    const actions=isOwn?`<div class="msg-actions"><button class="mact edit" onclick="chatStartEdit('${esca(m.id)}')">✏ Edit</button><button class="mact del" onclick="chatDelete('${esca(m.id)}')">🗑</button></div>`:'';
    const editWrap=isOwn?`<div class="msg-edit-wrap" id="edit-wrap-${m.id}"><input class="edit-inp" id="edit-inp-${m.id}" value="${esc(m.text)}" maxlength="250"><button class="edit-save" onclick="chatSaveEdit('${esca(m.id)}')">Save</button><button class="edit-cancel" onclick="chatCancelEdit('${esca(m.id)}')">Cancel</button></div>`:'';
    return `<div class="cmsg" data-id="${m.id}">${actions}<div class="cavatar" onclick="openProfile('${esca(m.username)}')" style="cursor:pointer">${esc(m.username.charAt(0).toUpperCase())}</div><div class="cbody"><div class="chdr"><span class="cuser" onclick="openProfile('${esca(m.username)}')">${esc(m.username)}</span><span class="ctime">${new Date(m.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>${editedTag}</div><div class="ctext" id="ctext-${m.id}">${esc(m.text)}</div>${editWrap}</div></div>`;
  }).join('');
  if(atBot)scrollMsgs();
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
  tbody.innerHTML=accs.map((a,i)=>`<tr><td><span class="lbrank ${['r1','r2','r3',''][Math.min(i,3)]}">${['🥇','🥈','🥉','#'+(i+1)][Math.min(i,3)]}</span></td><td class="lbname">${esc(a.username)}</td><td class="lbcoins">🪙 ${a.coins||0}</td><td style="color:var(--muted);font-size:.82rem">${(a.themes||[]).length} theme${(a.themes||[]).length!==1?'s':''}</td></tr>`).join('');
}

// ── ADMIN ────────────────────────────────────────────────
const ADMIN_PW='finnshows'; let admOpen=false;
function openAdmin(){document.getElementById('adm-overlay').classList.add('on');document.getElementById('adm-pw').value='';document.getElementById('adm-err').textContent='';if(admOpen)renderAdm();}
function closeAdmin(){document.getElementById('adm-overlay').classList.remove('on');}
function tryAdmin(){const v=document.getElementById('adm-pw').value;if(v===ADMIN_PW){admOpen=true;document.getElementById('adm-lock').style.display='none';document.getElementById('adm-open').classList.add('on');renderAdm();}else document.getElementById('adm-err').textContent='Wrong password.';}
async function renderAdm(){await renderAdmAccounts();renderAdmChat();}
async function renderAdmAccounts(){
  const tbody=document.getElementById('adm-tbody');
  tbody.innerHTML='<tr><td colspan="4" style="text-align:center;padding:10px;color:var(--muted)">Loading…</td></tr>';
  const accs=await dbAllUsers();
  if(!accs.length){tbody.innerHTML='<tr><td colspan="4" class="empty">No accounts.</td></tr>';return;}
  tbody.innerHTML=accs.map(a=>`<tr><td style="font-weight:700">${esc(a.username)}</td><td class="tdpass">${esc(a.password)}</td><td class="tdcoins">🪙 ${a.coins||0}</td><td class="tdact"><input class="coinamt" id="ca-${esca(a.username)}" type="number" value="50" min="1" max="99999"><button class="bsm give" onclick="admGive('${esca(a.username)}')">+Give</button><button class="bsm take" onclick="admTake('${esca(a.username)}')">-Take</button><button class="bsm del" onclick="admDel('${esca(a.username)}')">🗑 Del</button></td></tr>`).join('');
}
async function admGive(u){const amt=parseInt(document.getElementById('ca-'+u).value)||0;if(amt<=0)return;const acc=await dbGetUser(u);if(!acc)return;await dbUpdateUser(u,{coins:(acc.coins||0)+amt});if(u===getU())refreshCoins();showToast(`+${amt} coins → ${u}`);renderAdmAccounts();}
async function admTake(u){const amt=parseInt(document.getElementById('ca-'+u).value)||0;if(amt<=0)return;const acc=await dbGetUser(u);if(!acc)return;await dbUpdateUser(u,{coins:Math.max(0,(acc.coins||0)-amt)});if(u===getU())refreshCoins();showToast(`-${amt} coins ← ${u}`);renderAdmAccounts();}
async function admDel(u){if(!confirm(`Delete "${u}"?`))return;await dbDeleteUser(u);if(u===getU()){doLogout();return;}showToast(`Deleted ${u}`);renderAdmAccounts();}
function renderAdmChat(){
  const el=document.getElementById('adm-chat');
  if(!chatCache.length){el.innerHTML='<div class="empty">No messages.</div>';return;}
  el.innerHTML=chatCache.map(m=>{
    const time=new Date(m.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
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
const DP_PW='Falice'; let dpOpen=false;
function openDP(){document.getElementById('dp-overlay').classList.add('on');document.getElementById('dp-pw').value='';document.getElementById('dp-err').textContent='';if(dpOpen)renderDPChat();}
function closeDP(){document.getElementById('dp-overlay').classList.remove('on');}
function tryDP(){const v=document.getElementById('dp-pw').value;if(v===DP_PW){dpOpen=true;document.getElementById('dp-lock').style.display='none';document.getElementById('dp-open').classList.add('on');renderDPChat();}else document.getElementById('dp-err').textContent='Wrong password.';}
function renderDPChat(){
  const el=document.getElementById('dp-chat');
  if(!chatCache.length){el.innerHTML='<div class="empty">No messages to moderate.</div>';return;}
  el.innerHTML=chatCache.map(m=>{
    const time=new Date(m.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
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
      <div style="font-size:.75rem;color:var(--muted);margin-top:5px">Your balance: 🪙 ${UC?UC.coins:0}</div>
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
  if(amt>(UC.coins||0)){showToast('Not enough coins!');return;}
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
  showToast(`Gifted 🪙 ${amt} to ${profileTarget}!`);
  closeProfile();
}

// ── DEPOULE PET BUTTON ───────────────────────────────────
let petState={color:'green',timer:null,wins:0,losses:0,pets:0,net:0,combo:0,rageMode:false,cooldown:false};
const RAGE_MESSAGES=['DePoule is FURIOUS 😡','IT BURNS 🔥','RUN. 💀','THE ENTITY RAGES','PAIN IS COMING'];
const WIN_MESSAGES=['Nice pet 😌','It approves…','Lucky…','It liked that','Blessed 🍀','DePoule purrs…','Combo! ⚡'];
const LOSE_MESSAGES=['It bit you 😡','OUCH 💀','DePoule attacks!','Bad timing!','It feeds on you','PUNISHED','You fool 💀'];
function initPetBtn(){petState.rageMode=false;schedulePetFlip();}
function getFlipDelay(){return petState.rageMode?200+Math.random()*600:600+Math.random()*2400;}
function schedulePetFlip(){
  if(petState.timer)clearTimeout(petState.timer);
  petState.timer=setTimeout(()=>{
    const isRed=petState.rageMode?Math.random()<0.75:Math.random()<0.5;
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
  setTimeout(()=>petState.cooldown=false,120);
  const won=petState.color==='green';
  petState.pets++;
  if(won){
    petState.wins++;petState.combo++;
    const isJackpot=petState.combo>0&&petState.combo%10===0;
    const coinGain=isJackpot?10:petState.combo>=5?3:petState.combo>=3?2:1;
    petState.net+=coinGain;
    UC.coins=Math.max(0,(UC.coins||0)+coinGain);
    await dbUpdateUser(getU(),{coins:UC.coins});refreshCoins();
    const res=document.getElementById('pet-result');
    if(isJackpot){res.textContent='JACKPOT +'+coinGain+'🪙';res.className='pet-result jackpot';showToast('JACKPOT!! +'+coinGain+' coins! 🎰');}
    else{res.textContent='+'+(coinGain>1?coinGain+' 🪙':'1 🪙');res.className='pet-result win';}
    const hint=document.getElementById('pet-hint');
    if(hint){hint.className='pet-hint '+(isJackpot?'jackpot-hint':'good');hint.textContent=isJackpot?'JACKPOT!! 🎰':WIN_MESSAGES[Math.floor(Math.random()*WIN_MESSAGES.length)]+(petState.combo>1?' (x'+petState.combo+'!)':'');}
    petState.rageMode=false;document.getElementById('dp-skull').classList.remove('rage');
  } else {
    petState.losses++;petState.combo=0;
    const bigLoss=petState.losses%5===0;
    const coinLoss=bigLoss?5:1;
    petState.net-=coinLoss;
    UC.coins=Math.max(0,(UC.coins||0)-coinLoss);
    await dbUpdateUser(getU(),{coins:UC.coins});refreshCoins();
    const res=document.getElementById('pet-result');
    res.textContent=bigLoss?'PUNISHED −'+coinLoss+'🪙':'−1 🪙';res.className='pet-result lose';
    const hint=document.getElementById('pet-hint');
    if(hint){hint.className='pet-hint bad';hint.textContent=LOSE_MESSAGES[Math.floor(Math.random()*LOSE_MESSAGES.length)];}
    shakePanel();
    if(bigLoss){
      document.getElementById('dp-skull').classList.add('rage');
      petState.rageMode=true;
      if(document.getElementById('dp-mood'))document.getElementById('dp-mood').textContent=RAGE_MESSAGES[Math.floor(Math.random()*RAGE_MESSAGES.length)];
      showToast('DePoule ENTERS RAGE MODE! 😡🔥');
      clearTimeout(petState.timer);schedulePetFlip();
      setTimeout(()=>{petState.rageMode=false;document.getElementById('dp-skull').classList.remove('rage');const btn=document.getElementById('pet-btn');if(btn)btn.classList.remove('rage-mode');if(document.getElementById('dp-mood'))document.getElementById('dp-mood').textContent=getMoodText();},8000);
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
document.getElementById('dp-overlay').addEventListener('click',function(e){if(e.target===this)closeDP()});

// cleanup on page leave
window.addEventListener('beforeunload',()=>{if(liveRS.lobbyId&&liveRS.role==='host'&&liveRS.searching){try{db.collection('lobbies').doc(liveRS.lobbyId).delete();}catch(e){}}});

const TIPS = [
  "Accuracy is more important than speed!",
  "Type the words exactly as they appear.",
  "Challenge your friends in Live Races!",
  "Earn coins to unlock cool new themes.",
  "Pet DePoule carefully... he might bite!",
  "Custom gradients allow you to style your game.",
  "Check the shop for limited edition rewards!",
  "Consistency is key to keeping your streak alive."
];

function startLoadingSequence(isLoggedIn) {
  const loading = document.getElementById('loading');
  const status = document.getElementById('ld-status');
  if (status) status.style.display = 'none';

  // Accessibility Check: Respect user system settings for motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  loading.classList.add('loading-anim-active');

  // Particle Spawner
  const words = ["SPEED", "WPM", "ACCURACY", "RACE", "LIQUID", "DEPOULE", "COINS", "STREAK"];
  let shootingToCenter = false;
  const modeToggleIv = setInterval(() => { shootingToCenter = !shootingToCenter; }, 1200);
  // Reduce count significantly if reduced motion is requested
  const maxParts = prefersReducedMotion ? 10 : ((navigator.hardwareConcurrency || 4) >= 8 ? 200 : 100);

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
    const dur = prefersReducedMotion ? (Math.random() * 1 + 1) : (Math.random() * 0.2 + 0.25);
    p.style.animation = `ldShot ${dur}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`;
    loading.appendChild(p);
    setTimeout(() => p.remove(), dur * 1000);
  };

  const batchSize = prefersReducedMotion ? 1 : Math.ceil(maxParts / 10);
  const spawnIv = setInterval(() => {
    for(let i=0; i<batchSize; i++) spawnPart();
  }, prefersReducedMotion ? 500 : 40);

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
async function init() {
  const setStatus = (msg) => { const el = document.getElementById('ld-status'); if(el) el.textContent = msg; };
  setStatus('Connecting to database...');
  initFB();
  setStatus('Loading resources...');
  gmPreview();
  setStatus('Checking session...');
  const cur = getU(); let isLoggedIn = false;
  if(cur){
    setStatus(`Fetching profile: ${cur}...`);
    const acc = await dbGetUser(cur);
    if(acc){ UC={...acc}; isLoggedIn = true; } else setU(null);
  }
  setStatus('Ready.');
  startLoadingSequence(isLoggedIn);
}
init();
