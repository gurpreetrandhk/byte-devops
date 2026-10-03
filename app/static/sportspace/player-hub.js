// Player-first profiles and explicit geographic feed scopes.
const playerHub={profiles:new Map(),loading:new Set(),errors:new Map(),revision:0};
const hubBaseRender=render,hubBaseAPI=arenaAPI,hubBaseSocialAPI=api;
const hubPlayerURL=(id,tab='moments')=>'#player/'+encodeURIComponent(id)+'/'+tab;
const hubLocation=p=>[p.city,p.state,p.country].filter(Boolean).join(' / ');
const hubEmpty=message=>`<div class="hub-empty"><p>${escape(message)}</p></div>`;

function geographyToolbar(){
  const {country='India',state:region=''}=social.preferences;
  const labels={state:region||'Choose your state',country:country,global:'Your state → your country → worldwide'};
  return `<div class="geo-context"><span>${icon('map-pin')} <b>${escape(labels[social.mode]||labels.state)}</b><small>${social.mode==='state'?'Players and stories from your state':social.mode==='country'?'Your state first, then the rest of '+escape(country):'Local connections first. International moments next.'}</small></span><a href="${hubPlayerURL(arena.data?.currentUserId||'demo-user')}">Location from your profile ↗</a></div>`;
}

async function hubRaster(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Choose a JPG, PNG or WebP under 5 MB.');
  const bitmap=await createImageBitmap(file);
  try{
    const canvas=document.createElement('canvas'),scale=Math.min(1,1000/Math.max(bitmap.width,bitmap.height));
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const image=canvas.toDataURL('image/jpeg',0.8);if(image.length>400000)throw new Error('This photo is too large. Choose a smaller image.');return image;
  }finally{bitmap.close();}
}

function hubMediaForm(story=false){
  const community=view==='community'?communities().find(c=>c.id===ring.route.split('/')[1]):null;
  openSocialForm(story?'Add your story':'Share your moment',`<label class="field">Sport<select name="sport">${sports.slice(1).map(s=>`<option ${s===(community?.sport||arenaPlayer(arena.data?.currentUserId)?.sport)?'selected':''}>${escape(s)}</option>`).join('')}</select></label><label class="field">${story?'Caption':'Your moment'}<textarea name="text" ${story?'':'required'} maxlength="${story?500:3000}" placeholder="Share what happened in your game"></textarea></label><label class="field">Upload a photo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label><label class="field">Or use a photo URL<input name="image" type="url" maxlength="2048" placeholder="https://…"></label><p class="modal-note">${story?'A story needs a photo and stays visible for 24 hours.':'Photo optional. Your moment appears on your profile and geographic feeds.'}</p>`,'Share '+(story?'story':'moment'),async data=>{
    const file=data.get('photo'),image=file?.size?await hubRaster(file):data.get('image').trim();
    if(story&&!image){toast('Choose a photo for your story.');return false;}
    const payload={sport:data.get('sport'),text:data.get('text').trim(),...(image?{image}:{})};
    if(community&&!story)payload.communityId=community.id;
    const ok=await mutation(story?'/stories':'/posts',payload);if(ok)toast(story?'Your story is live.':'Your moment is published.');return ok;
  });
}
compose=function(){hubMediaForm(false);};
addStory=function(){hubMediaForm(true);};

interests=function(){
  openSocialForm('Your sporting interests',`<p class="modal-note">Your feed uses ${escape(social.preferences.state||social.preferences.city)}, ${escape(social.preferences.country||'India')} from your player location.</p><div class="interests-grid">${sports.slice(1).map(s=>`<label class="interest-option"><input type="checkbox" name="sports" value="${s}" ${social.preferences.sports.includes(s)?'checked':''}>${escape(s)}</label>`).join('')}</div>`,'Save interests',async data=>{
    const preferences={sports:data.getAll('sports')};
    if(social.online)return mutation('/preferences',preferences,'PATCH');
    social.preferences={...social.preferences,...preferences};localStorage.setItem('sportspace-social-preferences',JSON.stringify(social.preferences));render();
  });
};

async function loadPlayerHub(id){
  if(playerHub.loading.has(id)||playerHub.profiles.has(id)||playerHub.errors.has(id))return;
  playerHub.loading.add(id);
  const revision=playerHub.revision;
  try{const data=await arenaAPI('/players/'+encodeURIComponent(id));if(revision===playerHub.revision)playerHub.profiles.set(id,data);}
  catch(error){if(revision===playerHub.revision)playerHub.errors.set(id,error.message);}
  finally{playerHub.loading.delete(id);if((view==='player'&&decodeURIComponent(arena.route.split('/')[1]||'')===id)||(view==='ring'&&id===arena.data?.currentUserId))render();}
}
arenaAPI=async function(path='',method='GET',body,organizer=false){
  const data=await hubBaseAPI(path,method,body,organizer);
  if(method!=='GET'&&path!=='/location/resolve'){playerHub.revision++;playerHub.profiles.clear();playerHub.errors.clear();}
  return data;
};
api=async function(path,method='GET',body){
  const data=await hubBaseSocialAPI(path,method,body);
  if(method!=='GET'&&path!=='/location/resolve'){playerHub.revision++;playerHub.profiles.clear();playerHub.errors.clear();}
  return data;
};

function hubConnectionCard(p,reason='Squad connection'){
  return `<a class="hub-person" href="${hubPlayerURL(p.id)}">${arenaAvatar(p)}<div><strong>${escape(p.name)}</strong><small>${escape(reason)} / ${escape(p.sport)}</small><span>${p.gamesPlayed} games · ${p.wins} wins</span></div>${rankBadge(p.rank)}<span class="hub-card-arrow">↗</span></a>`;
}

function hubFindPost(id){return state.posts.find(p=>p.id===id)||[...playerHub.profiles.values()].flatMap(data=>data.posts).find(p=>p.id===id);}

function storyScopeMatch(story){
  const sameCountry=(story.country||'').toLowerCase()===(social.preferences.country||'').toLowerCase();
  const sameState=Boolean(social.preferences.state)&&(story.state||'').toLowerCase()===social.preferences.state.toLowerCase();
  return social.mode==='state'?sameCountry&&sameState:social.mode==='country'?sameCountry:true;
}

function hubSquad(team,focusedId){
  const roster=team.members.map(arenaPlayer).filter(Boolean);
  const source=arenaPlayer(team.ownerId),influence=team.influence;
  return `<article class="hub-squad"><div class="hub-section-heading"><div><span class="eyebrow">SQUAD CONNECTION</span><h3>${escape(team.name)}</h3><p>${escape(team.sport)} / ${escape(team.city)} · ${roster.length}/${team.capacity} members</p></div><button type="button" data-hub-squad="${escape(team.id)}">Full squad details ↗</button></div>${source&&influence?`<div class="hub-squad-recognition"><a href="${hubPlayerURL(source.id)}">${escape(source.name)} ${rankBadge(source.rank)}</a><span>Recognition → accepted teammates <b>+${Number(influence.memberBoost).toFixed(2)}</b> ${escape(team.sport)} feed visibility</span><small>Each player's earned awards stay their own.</small></div>`:''}<div class="hub-roster">${roster.filter(p=>p.id!==focusedId).map(p=>hubConnectionCard(p,'Teammate')).join('')||hubEmpty('No other accepted teammates yet.')}</div></article>`;
}

function hubProfileConnections(p,data){
  const teams=data?.teams||arena.data.teams.filter(t=>t.members.includes(p.id));
  const connections=data?.connections||[];
  const matchPeers=connections.filter(c=>c.matchIds.length);
  return `<section id="profile-connections" class="hub-connections-map hub-profile-connections" aria-label="${escape(p.name)}'s full connections"><div class="hub-section-heading"><div><span class="eyebrow">YOUR PEOPLE. YOUR GAME.</span><h2>${escape(p.name.split(' ')[0])}'s connections</h2><p>${teams.length} squads · ${data?connections.length:'…'} connected players. Click anyone to explore their profile and connections.</p></div><a href="#teams">Find teammates ↗</a></div><a class="hub-map-root" href="${hubPlayerURL(p.id)}" aria-label="Open ${escape(p.name)} profile and connections">${arenaAvatar(p)}<strong>${escape(p.name)}</strong>${rankBadge(p.rank)}</a><div class="hub-map-line" aria-hidden="true"></div><div class="hub-squad-grid">${teams.map(t=>hubSquad(t,p.id)).join('')||hubEmpty('No accepted squad connections yet.')}</div>${matchPeers.length?`<div class="hub-match-connections"><span class="eyebrow">CONNECTED THROUGH MATCHES</span><div class="hub-roster">${matchPeers.map(c=>hubConnectionCard(arenaPlayer(c.playerId)||c.player,c.matchIds.length+' shared match'+(c.matchIds.length===1?'':'es'))).join('')}</div></div>`:''}${!data?'<p class="hub-connection-loading" role="status">Loading all player and match connections…</p>':''}</section>`;
}

function hubHomeConnections(){
  const me=arenaPlayer(arena.data?.currentUserId);if(!me)return '';
  return hubProfileConnections(me,playerHub.profiles.get(me.id)).replace('id="profile-connections"','id="home-connections"').replace(`${escape(me.name.split(' ')[0])}'s connections`,'Your connections');
}

// The connections graph follows a player's memberships, including squads they do not lead.
networkHTML=function(){
  if(!arena.data)return '';
  const parts=location.hash.slice(1).split('/'), team=parts[1]==='team'?arena.data.teams.find(t=>t.id===decodeURIComponent(parts[2]||'')):null;
  const p=arenaPlayer(parts[1]==='player'?decodeURIComponent(parts[2]||''):team?.ownerId||arena.data.currentUserId);
  const teams=team?[team]:arena.data.teams.filter(t=>t.members.includes(p?.id));
  return `<section class="hub-connections-map"><div class="hub-section-heading"><div><span class="eyebrow">PEOPLE → SQUADS → PLAYERS</span><h2>${escape(p?.name||'Your')} connections</h2><p>Select a squad for its roster and activity. Open any player for their complete profile.</p></div><a href="${hubPlayerURL(p?.id||arena.data.currentUserId,'connections')}">Player connections ↗</a></div>${p?hubConnectionCard(p,'Player at the center'):''}<div class="hub-map-line" aria-hidden="true"></div><div class="hub-squad-grid">${teams.map(t=>hubSquad(t,p?.id)).join('')||hubEmpty('This player has no accepted squad connections yet. Browse squads to find teammates.')}</div><a class="hub-link" href="#teams">Find a squad / manage join requests →</a></section>`;
};

function hubRankDetails(p,data){
  return `<div class="hub-section-heading"><div><h2>Rank & achievements</h2><p>Your highest earned award sets your tier. Community support and squad visibility stay separate.</p></div><a href="#rankings/${encodeURIComponent(p.rank||'')}">Compare standings ↗</a></div><div class="hub-awards">${ranks.map(t=>`<button type="button" class="hub-award" data-hub-award="${t}" data-hub-player="${escape(p.id)}">${rankBadge(t)}<strong>${p.awards[t]||0}</strong><small>Open ${t} details ↗</small></button>`).join('')}</div><h3>Recorded award history</h3>${data.awards.length?data.awards.map(a=>`<button type="button" class="hub-history" data-hub-match="${escape(a.matchId)}">${rankBadge(a.tier)}<strong>+${a.count}</strong><span>${escape(a.organizer)}</span><small>Open associated match ↗</small></button>`).join(''):hubEmpty('No individual award events recorded yet. Existing demo totals are historical sample data.')}<p class="connection-note">Ranks come from match awards. Seeded historical totals do not imply a recorded match for every game.</p>`;
}

function hubMatches(data){
  return `<div class="hub-section-heading"><div><h2>Match history</h2><p>${data.recordedMatchCount} detailed appearances available. Open a match for scores, participants and awards.</p></div></div><div class="fixture-strip">${data.matches.map(m=>fixture(m).replace('</article>',`<button type="button" class="hub-link" data-hub-match="${escape(m.id)}">Full match details ↗</button></article>`)).join('')||hubEmpty('No detailed match records yet.')}</div><p class="connection-note">The profile has ${data.historicalGamesPlayed} historical demo games. Only the matches listed here have detailed records.</p>`;
}

function hubProfileStories(p,data){
  const active=data.stories.filter(s=>new Date(s.expiresAt)>new Date());
  return `<section class="hub-stories"><div class="hub-section-heading"><div><span class="eyebrow">PLAYER STORIES / 24 HOURS</span><h2>${p.id===arena.data.currentUserId?'Your':escape(p.name.split(' ')[0])+"’s"} stories</h2></div>${p.id===arena.data.currentUserId?'<button type="button" data-add-story>+ Add story</button>':''}</div><div class="hub-story-list">${active.map(s=>`<button type="button" class="hub-story" data-hub-story="${escape(s.id)}" data-hub-player="${escape(p.id)}"><img src="${escape(s.image)}" alt="${escape(s.text||s.sport)}" loading="lazy"><strong>${escape(s.sport)}</strong><small>Added by ${escape(p.name)}</small></button>`).join('')||hubEmpty('No active stories. New stories appear here for 24 hours.')}</div></section>`;
}

playerPage=function(){
  const id=decodeURIComponent(arena.route.split('/')[1]||''),p=arenaPlayer(id);
  if(!p)return hubEmpty('Player not found.');
  const data=playerHub.profiles.get(id),error=playerHub.errors.get(id);
  const requested=arena.route.split('/')[2],tab=['matches','awards','photos'].includes(requested)?requested:'moments';
  const own=id===arena.data.currentUserId,teamCount=arena.data.teams.filter(t=>t.members.includes(id)).length;
  const fullPhoto=p.cover||p.avatar||p.image;
  const header=`<section class="hub-profile"><div class="hub-identity">${arenaAvatar(p)}<div><span class="eyebrow">PLAYER PROFILE</span><h2>${escape(p.name)}</h2><p>${escape(p.sport)} · ${escape(hubLocation(p))}</p>${p.bio?`<p class="hub-bio">${escape(p.bio)}</p>`:''}</div><div class="hub-profile-actions">${own?'<button type="button" class="primary" data-edit-profile>Edit profile</button><button type="button" data-hub-upload>Upload full photo</button>':`${supportButton(p)}<button type="button" data-follow="${escape(p.name)}">${social.preferences.following.includes(p.name)?'Following':'Follow player'}</button>`}<button type="button" data-hub-share="${escape(id)}">Copy profile link ↗</button></div></div><div class="hub-stats"><a href="${hubPlayerURL(id,'matches')}"><strong>${p.gamesPlayed}</strong><span>Games played ↗</span></a><a href="${hubPlayerURL(id,'matches')}"><strong>${p.wins}</strong><span>Wins / ${p.gamesPlayed?Math.round(p.wins/p.gamesPlayed*100):0}% rate ↗</span></a><a href="${hubPlayerURL(id,'awards')}">${rankBadge(p.rank)||'<strong>Unranked</strong>'}<span>Rank details ↗</span></a><a href="${hubPlayerURL(id,'connections')}"><strong>${data?.connections.length??'…'}</strong><span>Player connections ↗</span></a></div></section>`;
  const tabs=`<nav class="hub-tabs" aria-label="Profile sections">${[['moments','Moments'],['matches','Matches'],['awards','Rank & awards'],['photos','Photos']].map(([key,label])=>`<a href="${hubPlayerURL(id,key)}" class="${tab===key?'active':''}" ${tab===key?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
  const connections=hubProfileConnections(p,data);
  const fullPhotoHTML=`<div class="hub-cover">${fullPhoto?`<button type="button" data-hub-photo="${escape(id)}" aria-label="Open full photo of ${escape(p.name)}"><img src="${escape(fullPhoto)}" alt="${escape(p.name)}'s ${p.cover||p.avatar?'profile photo':'sporting moment'}"></button>`:'<div class="hub-no-photo">YOUR GAME. YOUR STORY.</div>'}<span class="hub-cover-label">${escape(p.state||p.city)} / ${escape(p.country)}</span></div>`;
  const back='<a class="back-link" href="#ring">← Back to your feed</a>';
  if(!data)return back+connections+header+tabs+(error?`<div class="arena-error" role="alert">${escape(error)} <button type="button" data-hub-retry="${escape(id)}">Retry profile</button></div>`:'<p role="status" class="hub-empty">Loading this player’s connections and activity…</p>');
  let content;
  if(tab==='matches')content=hubMatches(data);
  else if(tab==='awards')content=hubRankDetails(p,data);
  else if(tab==='photos'){
    const photos=[...(fullPhoto?[{image:fullPhoto,text:'Profile photo',profile:true}]:[]),...data.posts.filter(post=>post.image),...data.stories];
    content=`<h2>Photos & sporting moments</h2><div class="hub-gallery">${photos.map((photo,i)=>`<button type="button" data-hub-gallery="${i}" data-hub-player="${escape(id)}"><img src="${escape(photo.image)}" alt="${escape(photo.text||photo.sport||'Photo')}" loading="lazy"><span>${escape(photo.text||photo.sport||'Photo')}</span></button>`).join('')||hubEmpty('No photos yet. Upload a full profile photo or share a story.')}</div>`;
  }else content=fullPhotoHTML+hubProfileStories(p,data)+`<div class="hub-section-heading"><h2>Moments shared by ${escape(p.name)}</h2></div>`+data.posts.map(post=>postHTML({...post,time:relativeTime(post.time),likes:post.likes-Number(post.liked)})).join('')+(data.posts.length?'':hubEmpty('No posts shared yet.'));
  return back+connections+header+tabs+`<section class="hub-content">${content}</section>`;
};

function hubMatchDetails(id){
  const m=arena.data.matches.find(m=>m.id===id);if(!m)return;
  const awards=arena.data.awards.filter(a=>a.matchId===id);
  openModal('Match details',`<p class="modal-note">${escape(m.organizer)} / ${escape(m.sport)}</p>${fixture(m)}<p class="modal-note">${escape(m.venue)} / ${escape(m.clock)}</p><h3>Recorded participants</h3><div class="hub-roster">${m.participantIds.map(arenaPlayer).filter(Boolean).map(p=>hubConnectionCard(p,'Match participant')).join('')}</div><h3>Match awards</h3>${awards.map(a=>`<p class="modal-note">${escape(arenaPlayer(a.playerId)?.name||'Player')} / ${escape(a.tier)} +${a.count}</p>`).join('')||'<p class="modal-note">No awards issued for this match yet.</p>'}`,'Close',()=>{});
  hubCloseOnNavigation();
}

function hubCloseOnNavigation(){$('#modal-body').querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>$('#modal').close()));}
function hubFullImage(image,caption){openModal('Full picture',`<figure class="hub-full-photo"><img src="${escape(image)}" alt="${escape(caption)}"><figcaption>${escape(caption)}</figcaption></figure>`,'Close',()=>{});}

async function uploadHubPhoto(){
  const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';
  input.onchange=async()=>{
    const file=input.files[0];if(!file)return;
    try{
      const cover=await hubRaster(file);
      arena.data=await arenaAPI('/players/'+encodeURIComponent(arena.data.currentUserId),'PATCH',{cover});render();toast('Full photo saved.');
    }catch(error){toast(error.message||'Could not upload this photo.');}
  };input.click();
}

async function detectProfileLocation(button){
  const dialog=document.querySelector('#profile-editor'),status=dialog?.querySelector('[data-profile-location-status]');
  if(!dialog||!status)return;
  button.disabled=true;status.textContent='Waiting for location permission…';
  try{
    if(!navigator.geolocation)throw new Error('Location is unavailable. You can enter your region below.');
    const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,timeout:10000,maximumAge:300000}));
    status.textContent='Finding your city, state and country…';
    const result=await arenaAPI('/location/resolve','POST',{latitude:position.coords.latitude,longitude:position.coords.longitude});
    // A dismissed editor must never receive a delayed location result.
    if(!dialog.open||!button.isConnected)return;
    for(const key of ['country','state','city'])dialog.querySelector('#profile-'+key).value=result.location[key];
    dialog.querySelector('#profile-country').dispatchEvent(new Event('input',{bubbles:true}));
    status.textContent='Detected '+hubLocation(result.location)+'. Save your profile to apply this location.';
  }catch(error){
    if(dialog.open&&button.isConnected)status.textContent=error.code===1?'Location permission declined. Your saved location is kept; you can edit it below.':error.message||'Could not detect your location. Enter your region below.';
  }finally{if(button.isConnected)button.disabled=false;}
}

document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;const d=button.dataset;
  if('profileDetectLocation'in d)await detectProfileLocation(button);
  else if(d.hubStory){
    const data=playerHub.profiles.get(d.hubPlayer);if(!data)return;
    const known=new Set(social.stories.map(s=>s.id));social.stories.push(...data.stories.filter(s=>!known.has(s.id)));
    storyOwnerId=d.hubPlayer;showStory(d.hubStory);
  }else if(d.hubMatch)hubMatchDetails(d.hubMatch);
  else if(d.hubSquad){
    const team=arena.data.teams.find(t=>t.id===d.hubSquad);if(!team)return;
    const teamMatches=arena.data.matches.filter(m=>m.home===team.name||m.away===team.name);
    openModal(team.name,hubSquad(team,null)+`<h3>Squad matches</h3>${teamMatches.map(m=>fixture(m).replace('</article>',`<button type="button" class="hub-link" data-hub-match="${escape(m.id)}">Match details ↗</button></article>`)).join('')||'<p class="modal-note">No squad matches recorded yet.</p>'}<div class="connection-actions">${teamJoin(team)}<a href="#teams">Manage / browse squads ↗</a></div>`,'Close',()=>{});hubCloseOnNavigation();
  }else if(d.hubAward){
    const p=arenaPlayer(d.hubPlayer),data=playerHub.profiles.get(d.hubPlayer);if(!p||!data)return;
    const events=data.awards.filter(a=>a.tier===d.hubAward);
    openModal(d.hubAward+' award details',`${rankBadge(d.hubAward)}<p class="modal-note">${escape(p.name)} has ${p.awards[d.hubAward]} ${escape(d.hubAward)} awards.</p>${events.map(a=>`<button type="button" class="hub-history" data-hub-match="${escape(a.matchId)}">+${a.count} / ${escape(a.organizer)} / Open match ↗</button>`).join('')||'<p class="modal-note">These are seeded historical demo totals. No individual award records available for this tier yet.</p>'}`,'Close',()=>{});
  }else if(d.hubPhoto){const p=arenaPlayer(d.hubPhoto);if(p)hubFullImage(p.cover||p.avatar||p.image,p.name);}
  else if(d.hubGallery!==undefined){
    const data=playerHub.profiles.get(d.hubPlayer),p=arenaPlayer(d.hubPlayer);if(!data||!p)return;
    const photo=p.cover||p.avatar||p.image,items=[...(photo?[{image:photo,text:'Profile photo'}]:[]),...data.posts.filter(p=>p.image),...data.stories];
    const item=items[Number(d.hubGallery)];if(item)hubFullImage(item.image,item.text||p.name);
  }else if('hubUpload'in d)await uploadHubPhoto();
  else if(d.hubShare){
    const url=new URL(location.href);url.hash=hubPlayerURL(d.hubShare);
    try{await navigator.clipboard.writeText(url.href);toast('Profile link copied.');}catch{openModal('Share this profile',`<label class="field">Profile link<input value="${escape(url.href)}" readonly></label>`,'Close',()=>{});}
  }else if(d.hubRetry){playerHub.errors.delete(d.hubRetry);loadPlayerHub(d.hubRetry);render();}
});

render=function(){
  hubBaseRender();
  const me=arenaPlayer(arena.data?.currentUserId);
  const avatar=document.querySelector('.bottom-profile-avatar');
  if(avatar&&me)avatar.innerHTML=me.avatar?`<img src="${escape(me.avatar)}" alt="">`:escape(me.initials);
  document.querySelectorAll('[data-bottom-route]').forEach(link=>{
    const active=link.dataset.bottomRoute===view||(link.dataset.bottomRoute==='profile'&&view==='player'&&decodeURIComponent(arena.route.split('/')[1]||'')===arena.data?.currentUserId)||(link.dataset.bottomRoute==='discover'&&view==='community');
    link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
  if(view==='ring'){
    $('.page-heading').hidden=true;$('#filters').hidden=true;
    if(me)loadPlayerHub(me.id);
  }
  if(view==='player'&&arena.data){
    const id=decodeURIComponent(arena.route.split('/')[1]||'');loadPlayerHub(id);
    $('#subtitle').textContent='Their game. Their people. Their complete story.';
    $('.page-heading').hidden=true;$('#filters').hidden=true;
  }
};
render();
