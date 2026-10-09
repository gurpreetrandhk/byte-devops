// Hold account-specific API calls until a session has been established.
const nativeFetch=window.fetch.bind(window);
let releaseAccount;
const accountReady=new Promise(resolve=>releaseAccount=resolve);
const account={userId:null};
let accountResetToken=new URLSearchParams(location.hash.slice(1)).get('reset-token')||'';
if(accountResetToken)history.replaceState(null,'',location.pathname+location.search+'#ring');
window.fetch=async function(input,options={}){
  const url=typeof input==='string'?input:input.url;
  if(url.startsWith('/api/arena')||url.startsWith('/api/social')||url.startsWith('/api/messages'))await accountReady;
  if(url.startsWith('/api/'))options={...options,headers:{...options.headers,'X-Dhoyo-Request':'1'}};
  const result=await nativeFetch(input,options);
  if(result.status===401&&!url.startsWith('/api/auth/')&&!document.body.classList.contains('account-visible')){
    account.userId=null;
    showAccountForm('login','Your session has expired. Sign in again.');
  }
  return result;
};
async function accountRequest(path,payload){
  let response;
  try{response=await nativeFetch('/api/auth/'+path,{method:payload?'POST':'GET',headers:{'Content-Type':'application/json','X-Dhoyo-Request':'1'},body:payload?JSON.stringify(payload):undefined});}
  catch{throw new Error('Could not reach the account service. Check your connection and try again.');}
  const value=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(value?.error||'The account service is temporarily unavailable. Try again.');
  if(!value||typeof value!=='object')throw new Error('The account service returned an unexpected response. Try again.');
  return value;
}
async function rememberAccountPassword(payload){
  if(!window.isSecureContext||typeof window.PasswordCredential!=='function'||typeof navigator.credentials?.store!=='function')return;
  try{
    const credential=new PasswordCredential({id:payload.email.trim(),password:payload.password,...(payload.name?{name:payload.name.trim()}:{})});
    await navigator.credentials.store(credential);
  }catch{
    // Browser password saving is optional; declining it must still allow sign-in.
  }
}
function accountIcon(name){
  const paths={
    arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
    eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff:'<path d="m3 3 18 18M10.6 5.1A12 12 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.2 4M6.2 6.2A18 18 0 0 0 2 12s3.5 7 10 7a13 13 0 0 0 5.8-1.4M10 10a3 3 0 0 0 4 4"/>',
    gamepad:'<path d="M7 7h10a4 4 0 0 1 4 3l1 7a2 2 0 0 1-3.3 1.8L16 16H8l-2.7 2.8A2 2 0 0 1 2 17l1-7a4 4 0 0 1 4-3Z"/><path d="M6 11h4m-2-2v4m7-2h.01m3 2h.01"/>',
    flag:'<path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
    shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.arrow}</svg>`;
}
function showAccountForm(mode='login',message='',notice=''){
  const register=mode==='register',forgot=mode==='forgot',reset=mode==='reset';
  const path=forgot?'forgot-password':reset?'reset-password':mode;
  const title=register?'Join the game.':forgot?'Forgot your password?':reset?'Choose a new password.':'Welcome back, player.';
  const intro=register?'A new squad. A new story. It starts with you.':forgot?'Enter your account email to receive a password reset link.':reset?'Use at least 10 characters, then sign in with your new password.':'Your squad is waiting. Let’s get you back in.';
  const submitLabel=register?'Create my account':forgot?'Send reset link':reset?'Reset password':'Let’s play';
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  let overlay=document.getElementById('account-screen');
  const previousEmail=overlay?.querySelector('[name="email"]')?.value||'';
  if(!overlay){overlay=document.createElement('section');overlay.id='account-screen';overlay.setAttribute('aria-label','Player account access');document.body.append(overlay);}
  document.querySelector('.shell').inert=true;document.querySelector('.sidebar').inert=true;document.querySelector('.app-bottom-nav').inert=true;
  document.body.classList.add('account-visible');
  overlay.classList.toggle('account-register',register);
  overlay.innerHTML=`
    <div class="account-scene" aria-hidden="true"></div>
    <header class="account-header">
      <a class="brand account-brand" href="/ring" aria-label="dhoyo home"><span class="account-brand-symbol" aria-hidden="true">d</span>dhoyo<span class="account-brand-dot">.</span></a>
      <span class="account-header-note"><span></span>ONE COMMUNITY. EVERY GAME.</span>
    </header>
    <div class="account-layout">
      <div class="account-welcome">
        <span class="account-kicker"><span></span>THE GAME STARTS HERE</span>
        <h1>Your people.<br><span>Your game.</span></h1>
        <p>Find your squad. Share your highlights.<br>Make every game a story worth telling.</p>
        <div class="account-pills"><span>ON THE FIELD</span><span>ON THE SERVER</span><span>IN GOOD COMPANY</span></div>
        <div class="account-stickers" aria-label="Sports sticker pack">
          <div class="account-sticker-strip"></div>
          <p><strong>Big plays. Bigger reactions.</strong><span>Sign in and send a little good energy to your teammates.</span></p>
        </div>
        <div class="account-quest">${accountIcon('flag')}<div><strong>Great games. Even better company.</strong><span>Your next teammate is out there.</span></div></div>
      </div>
      <form id="account-${mode}-form" class="account-form" method="post" action="/api/auth/${path}" autocomplete="on" aria-labelledby="account-title">
        <div class="account-card-top"><span class="account-access">${accountIcon('gamepad')} PLAYER ACCESS</span><span class="account-card-index" aria-hidden="true">${register?'02':'01'} / DH</span></div>
        <div class="account-auth-tabs" role="group" aria-label="Account options">
          <button type="button" data-account-mode="login" class="${mode==='login'?'active':''}" aria-pressed="${mode==='login'}">Log in</button>
          <button type="button" data-account-mode="register" class="${register?'active':''}" aria-pressed="${register}">Sign up</button>
        </div>
        <h2 id="account-title">${title}</h2>
        <p class="account-form-intro">${intro}</p>
        ${register?'<label for="account-name">Your name<input id="account-name" name="name" autocomplete="name" placeholder="What should we call you?" maxlength="100" required></label>':''}
        ${reset?'':'<label for="account-email">Email address<input id="account-email" name="email" type="email" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="you@example.com" maxlength="254" required></label>'}
        ${forgot?'':`<label for="account-password">${reset?'New password':'Password'}</label>
        <div class="account-password-field">
          <input id="account-password" name="password" type="password" autocomplete="${register||reset?'new-password':'current-password'}" placeholder="${register||reset?'Create a password':'Enter your password'}" ${register||reset?'aria-describedby="account-password-help" minlength="10"':''} maxlength="128" required>
          <button type="button" class="account-password-toggle" aria-label="Show password" aria-controls="account-password" aria-pressed="false">${accountIcon('eye')}</button>
        </div>`}
        ${register||reset?'<small id="account-password-help" class="account-password-help">Use at least 10 characters.</small>':''}
        ${reset?'<label for="account-password-confirm">Confirm new password<input id="account-password-confirm" name="passwordConfirm" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label>':''}
        ${register?`
          <div class="account-location"><label for="account-city">City<input id="account-city" name="city" autocomplete="address-level2" placeholder="Your city" maxlength="80" required></label><label for="account-state">State / region<input id="account-state" name="state" autocomplete="address-level1" placeholder="Your state" maxlength="80" required></label></div>
          <div class="account-location"><label for="account-country">Country<input id="account-country" name="country" autocomplete="country-name" placeholder="Your country" maxlength="80" required></label><label for="account-sport">Your sport<select id="account-sport" name="sport">${['Football','Cricket','Basketball','Badminton','Tennis','Running','Esports','Swimming','Volleyball'].map(s=>`<option>${s}</option>`).join('')}</select></label></div>`:''}
        ${mode==='login'||reset?`<button type="button" class="account-forgot">${reset?'Request a new reset link':'Forgot password?'}</button>`:''}
        <p class="account-error" role="alert"></p>
        <p class="account-notice" role="status"></p>
        <button class="primary account-submit" type="submit"><span>${submitLabel}</span>${accountIcon('arrow')}</button>
        <p class="account-switch-line">${forgot||reset?'':register?'Already on the team?':'New to the game?'} <button type="button" class="account-switch">${forgot||reset?'Back to log in':register?'Log in':'Create an account'}</button></p>
        <div class="account-card-footer">${accountIcon('shield')}<span>Your profile. Your community. Your next game.</span></div>
      </form>
    </div>
    <footer class="account-footer"><span>BUILT FOR THE LOVE OF THE GAME</span><span>FIND YOUR SQUAD. MAKE YOUR MARK.${accountIcon('arrow')}</span></footer>`;
  document.body.classList.remove('account-pending');
  overlay.querySelector('.account-error').textContent=message;
  overlay.querySelector('.account-notice').textContent=notice;
  const email=overlay.querySelector('[name="email"]');
  if(email)email.value=previousEmail;
  const stickerStrip=overlay.querySelector('.account-sticker-strip');
  RingStickers.ready.then(items=>{
    if(!stickerStrip.isConnected)return;
    for(const sticker of items){
      const image=document.createElement('img');
      image.className='account-sticker';image.src=sticker.image;image.alt=sticker.name;
      image.width=128;image.height=128;stickerStrip.append(image);
    }
    if(!items.length)stickerStrip.closest('.account-stickers').hidden=true;
  });
  overlay.querySelector('.account-switch').onclick=()=>showAccountForm(mode==='login'?'register':'login');
  const forgotButton=overlay.querySelector('.account-forgot');
  if(forgotButton)forgotButton.onclick=()=>showAccountForm('forgot');
  overlay.querySelectorAll('[data-account-mode]').forEach(button=>button.onclick=()=>{
    if(button.dataset.accountMode!==mode)showAccountForm(button.dataset.accountMode);
  });
  const password=overlay.querySelector('[name="password"]');
  const passwordToggle=overlay.querySelector('.account-password-toggle');
  if(passwordToggle)passwordToggle.onclick=event=>{
    const button=event.currentTarget,visible=password.type==='password';
    password.type=visible?'text':'password';
    button.setAttribute('aria-label',visible?'Hide password':'Show password');
    button.setAttribute('aria-pressed',String(visible));
    button.innerHTML=accountIcon(visible?'eyeOff':'eye');
  };
  overlay.querySelector('form').onsubmit=async event=>{
    event.preventDefault();
    const form=event.target,button=form.querySelector('[type=submit]');
    const modeButtons=form.querySelectorAll('[data-account-mode],.account-switch,.account-forgot');
    button.disabled=true;modeButtons.forEach(item=>item.disabled=true);
    form.setAttribute('aria-busy','true');
    form.querySelector('.account-error').textContent='';
    form.querySelector('.account-notice').textContent='';
    button.querySelector('span').textContent=register?'Creating your account…':forgot?'Sending reset link…':reset?'Resetting your password…':'Signing in…';
    const payload=Object.fromEntries(new FormData(form));
    if(payload.email)payload.email=payload.email.trim();
    try{
      if(reset){
        if(payload.password!==payload.passwordConfirm)throw new Error('The new passwords do not match.');
        const result=await accountRequest(path,{token:accountResetToken,password:payload.password});
        accountResetToken='';account.userId=null;
        showAccountForm('login','',result.message);
        return;
      }
      const result=await accountRequest(path,payload);
      if(forgot){form.querySelector('.account-notice').textContent=result.message;return;}
      account.userId=result.userId;
      await rememberAccountPassword(payload);
      form.remove();
      location.replace('/ring#ring');
    }
    catch(error){
      form.querySelector('.account-error').textContent=error.message;
    }
    finally{
      button.disabled=false;modeButtons.forEach(item=>item.disabled=false);
      form.setAttribute('aria-busy','false');
      button.querySelector('span').textContent=submitLabel;
    }
  };
  if(window.matchMedia('(min-width: 761px)').matches)overlay.querySelector('input').focus({preventScroll:true});
}
(async()=>{
  if(accountResetToken){showAccountForm('reset');return;}
  try{const result=await accountRequest('me');account.userId=result.userId;if(!result.userId){showAccountForm();return;}
    document.body.classList.remove('account-pending');
    document.querySelector('[data-bottom-route="profile"]').href='#player/'+encodeURIComponent(result.userId);
    const logout=document.createElement('button');logout.className='account-logout';logout.textContent='Sign out';logout.onclick=async()=>{try{await accountRequest('logout',{});location.reload();}catch(error){logout.textContent=error.message;}};document.querySelector('.topbar').append(logout);
    releaseAccount();
  }catch(error){showAccountForm('login','Could not reach the server. Check the connection and try signing in.');}
})();
