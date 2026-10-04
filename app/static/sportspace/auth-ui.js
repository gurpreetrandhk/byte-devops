// Hold account-specific API calls until a session has been established.
const nativeFetch=window.fetch.bind(window);
let releaseAccount;
const accountReady=new Promise(resolve=>releaseAccount=resolve);
const account={userId:null};
window.fetch=async function(input,options={}){
  const url=typeof input==='string'?input:input.url;
  if(url.startsWith('/api/arena')||url.startsWith('/api/social'))await accountReady;
  if(url.startsWith('/api/'))options={...options,headers:{...options.headers,'X-Dhoyo-Request':'1'}};
  const result=await nativeFetch(input,options);
  if(result.status===401&&!url.startsWith('/api/auth/'))showAccountForm(false,'Your session has expired. Sign in again.');
  return result;
};
async function accountRequest(path,payload){
  const response=await nativeFetch('/api/auth/'+path,{method:payload?'POST':'GET',headers:{'Content-Type':'application/json','X-Dhoyo-Request':'1'},body:payload?JSON.stringify(payload):undefined});
  const value=await response.json();if(!response.ok)throw new Error(value.error||'Could not connect. Try again.');return value;
}
function showAccountForm(register=false,message=''){
  let overlay=document.getElementById('account-screen');
  if(!overlay){overlay=document.createElement('section');overlay.id='account-screen';document.body.append(overlay);}
  document.querySelector('.shell').inert=true;document.querySelector('.sidebar').inert=true;document.querySelector('.app-bottom-nav').inert=true;
  overlay.innerHTML=`<div class="account-welcome"><a class="brand" href="#">dhoyo.</a><span class="eyebrow">YOUR PEOPLE. YOUR GAME.</span><h1>Good games start<br>with good company.</h1><p>A place for your team, your stories, and the people you haven’t played with yet.</p><div class="account-pills"><span>Find your squad</span><span>Share your moments</span><span>Play together</span></div></div><form class="account-form"><h2>${register?'Find your people.':'Welcome back.'}</h2><p>${register?'Tell us a little about yourself to get started.':'Sign in to your own profile and community.'}</p>${register?'<label>Your name<input name="name" autocomplete="name" maxlength="100" required></label>':''}<label>Email address<input name="email" type="email" autocomplete="email" maxlength="254" required></label><label>Password<input name="password" type="password" autocomplete="${register?'new-password':'current-password'}" minlength="10" maxlength="128" required></label>${register?`<small>At least 10 characters.</small><div class="account-location"><label>City<input name="city" autocomplete="address-level2" maxlength="80" required></label><label>State / region<input name="state" autocomplete="address-level1" maxlength="80" required></label></div><label>Country<input name="country" autocomplete="country-name" maxlength="80" required></label><label>Your sport<select name="sport">${['Football','Cricket','Basketball','Badminton','Tennis','Running','Esports','Swimming','Volleyball'].map(s=>`<option>${s}</option>`).join('')}</select></label>`:''}<p class="account-error" role="alert"></p><button class="primary" type="submit">${register?'Create my account':'Sign in'}</button><button type="button" class="account-switch">${register?'Already have an account? Sign in':'New here? Create an account'}</button></form>`;
  overlay.querySelector('.account-error').textContent=message;
  overlay.querySelector('.account-switch').onclick=()=>showAccountForm(!register);
  overlay.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const form=event.target,button=form.querySelector('[type=submit]');button.disabled=true;
    try{const result=await accountRequest(register?'register':'login',Object.fromEntries(new FormData(form)));account.userId=result.userId;location.hash="ring";location.reload();}
    catch(error){form.querySelector('.account-error').textContent=error.message;button.disabled=false;}
  };
  overlay.querySelector('input').focus();
}
(async()=>{
  try{const result=await accountRequest('me');account.userId=result.userId;if(!result.userId){showAccountForm();return;}
    document.querySelector('[data-bottom-route="profile"]').href='#player/'+encodeURIComponent(result.userId);
    const logout=document.createElement('button');logout.className='account-logout';logout.textContent='Sign out';logout.onclick=async()=>{try{await accountRequest('logout',{});location.reload();}catch(error){logout.textContent=error.message;}};document.querySelector('.topbar').append(logout);
    releaseAccount();
  }catch(error){showAccountForm(false,'Could not reach the server. Check the connection and try signing in.');}
})();
