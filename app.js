'use strict';
const C = window.MINUTES_CONFIG;
const $ = id => document.getElementById(id);
let token = '', subject = '', job = '', busy = false, generation = 0;
const say = message => { $('status').textContent = message; };
function configValid() {
  try {
    const domain = new URL(C.domain), redirect = new URL(C.redirectUri);
    return domain.protocol === 'https:' && domain.hostname.endsWith('.auth.ap-northeast-1.amazoncognito.com') && domain.pathname === '/'
      && redirect.protocol === 'https:' && redirect.origin === location.origin && redirect.pathname === location.pathname
      && !redirect.search && !redirect.hash;
  } catch { return false; }
}
function reset(removeJob=true) {
  token = ''; subject = ''; job = ''; generation++; busy = false;
  $('work').classList.add('hidden'); $('logout').disabled = true; $('login').disabled = !configValid();
  $('check').disabled = true; $('upload').disabled = false; $('files').replaceChildren();
  $('file').value = ''; $('consent').checked = false;
  if(removeJob) sessionStorage.removeItem('minutes-job');
}
function b64(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function random() { return b64(crypto.getRandomValues(new Uint8Array(32))); }
async function login() {
  if (!configValid()) throw new Error('ログイン先と公開URLの設定が必要です。');
  const verifier = random(), state = random();
  const challenge = b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  sessionStorage.setItem('minutes-pkce', JSON.stringify({verifier,state,created:Date.now()}));
  const url = new URL('/oauth2/authorize', C.domain);
  url.search = new URLSearchParams({response_type:'code',client_id:C.clientId,redirect_uri:C.redirectUri,
    scope:C.scope,state,code_challenge:challenge,code_challenge_method:'S256'});
  location.assign(url.href);
}
async function callback() {
  const params = new URLSearchParams(location.search);
  if (!params.has('code') && !params.has('error')) return false;
  history.replaceState(null,'',location.pathname);
  const raw = sessionStorage.getItem('minutes-pkce'); sessionStorage.removeItem('minutes-pkce');
  let pending; try { pending = JSON.parse(raw); } catch {}
  if (!configValid() || !pending || params.get('state') !== pending.state
      || Date.now()-pending.created > 600000 || Date.now()<pending.created)
    throw new Error('ログインの確認に失敗しました。もう一度ログインしてください。');
  if (params.has('error')) throw new Error('ログインが完了しませんでした。');
  const response = await fetch(new URL('/oauth2/token', C.domain), {method:'POST',cache:'no-store',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'authorization_code',client_id:C.clientId,code:params.get('code'),
      redirect_uri:C.redirectUri,code_verifier:pending.verifier})});
  if (!response.ok) throw new Error('ログインを完了できませんでした。');
  const result = await response.json();
  const access = result.access_token;
  // UI checks only. API Gateway verifies the signature and the API verifies claims.
  let claims; try { const part=access.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'); claims=JSON.parse(atob(part)); } catch {}
  if (!claims || claims.iss !== C.issuer || claims.client_id !== C.clientId || claims.token_use !== 'access'
      || claims.exp*1000 <= Date.now() || !String(claims.scope).split(' ').includes('minutes-demo/use'))
    throw new Error('利用に必要な権限がありません。');
  token=access; subject=claims.sub; $('work').classList.remove('hidden');
  $('login').disabled=true; $('logout').disabled=false;
  try {
    const saved=JSON.parse(sessionStorage.getItem('minutes-job'));
    if(saved && saved.subject===subject && /^[0-9a-f-]{36}$/.test(saved.job)) {job=saved.job;$('check').disabled=false;}
    else sessionStorage.removeItem('minutes-job');
  } catch {sessionStorage.removeItem('minutes-job');}
  say(job?'ログインしました。「結果を再確認」で前回の結果を確認できます。':'ログインしました。サンプル音声を選択してください。');
  return true;
}
async function api(path, data) {
  if (!token) throw new Error('ログインしてください。');
  const response=await fetch(C.apiBase+path,{method:data?'POST':'GET',cache:'no-store',
    headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},
    ...(data?{body:JSON.stringify(data)}:{})});
  if (response.status===401) {reset(false);throw new Error('ログインの有効期限が切れました。再ログインしてください。');}
  const result=await response.json();
  if (!response.ok) throw new Error(result.error || '操作できませんでした。');
  return result;
}
function validS3(url) {
  const u=new URL(url);
  if (u.protocol!=='https:' || !['minutes-demo-dev.s3.ap-northeast-1.amazonaws.com','minutes-demo-dev.s3.amazonaws.com'].includes(u.hostname))
    throw new Error('保存先を確認できませんでした。');
  return u.href;
}
async function results() {
  if (!job) return false;
  const current=generation;
  const result=await api('/list-outputs?job_id='+encodeURIComponent(job));
  if (current!==generation) return false;
  $('files').replaceChildren();
  for(const item of result.items || []) {
    if (!['transcript.txt','minutes.md','minutes.docx'].includes(item.name)) continue;
    const li=document.createElement('li'), button=document.createElement('button');
    button.textContent=item.name+' を保存';
    button.addEventListener('click', async()=>{
      button.disabled=true;
      try {
        const current=generation;
        const r=await api('/download-url',{job_id:job,name:item.name});
        if (current!==generation) return;
        const a=document.createElement('a'); a.href=validS3(r.download_url);a.rel='noopener noreferrer';
        a.download=item.name; document.body.append(a);a.click();a.remove();
      } catch(e) {say(e.message);} finally {button.disabled=false;}
    });
    li.append(button);$('files').append(li);
  }
  return (result.items || []).length===3;
}
async function upload() {
  if (busy) return;
  const file=$('file').files[0];
  if (!file || !file.name.toLowerCase().endsWith('.m4a') || file.size<1 || file.size>20*1024*1024)
    throw new Error('20MiB以内のM4Aファイルを選択してください。');
  if (!$('consent').checked) throw new Error('音声の外部送信への同意を確認してください。');
  busy=true; $('upload').disabled=true; $('check').disabled=true; const current=generation;
  try {
    say('アップロードを準備しています…');
    const r=await api('/upload-url',{filename:file.name,size:file.size});
    if (current!==generation) return;
    job=r.job_id; $('files').replaceChildren();
    const form=new FormData();
    for(const [name,value] of Object.entries(r.upload.fields)) form.append(name,value);
    form.append('file',file);
    say('アップロードしています…');
    const response=await fetch(validS3(r.upload.url),{method:'POST',body:form});
    if (!response.ok) throw new Error('アップロードできませんでした。管理者にご連絡ください。');
    sessionStorage.setItem('minutes-job',JSON.stringify({subject,job}));
    say('議事録を作成しています…');
    for(let n=0;n<100 && current===generation;n++) {
      await new Promise(resolve=>setTimeout(resolve,3000));
      if (current!==generation) return;
      if (await results()) {say('完了しました。');return;}
    }
    if(current===generation) say('まだ完了していません。「結果を再確認」で確認できます。処理に失敗した場合は管理者にご連絡ください。');
  } finally { if(current===generation) {busy=false;$('upload').disabled=false;$('check').disabled=!job;} }
}
$('login').onclick=()=>login().catch(e=>say(e.message));
$('logout').onclick=()=>{
  reset();sessionStorage.removeItem('minutes-pkce');
  const u=new URL('/logout',C.domain);u.search=new URLSearchParams({client_id:C.clientId,logout_uri:C.redirectUri});location.assign(u.href);
};
$('upload').onclick=()=>upload().catch(e=>say(e.message));
$('check').onclick=async()=>{try{say(await results()?'完了しました。':'まだ完了していません。');}catch(e){say(e.message);}};
reset(false);
if (!configValid()) say('管理者によるログイン先・公開URLの設定が必要です。');
else callback().then(done=>{if(!done)say('ログインして利用してください。');}).catch(e=>{reset(false);say(e.message);});
