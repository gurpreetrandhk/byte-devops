const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const script = readFileSync(path.join(__dirname, '../static/sportspace/friends.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = (value, status = 200) => ({status, ok: status < 400, json: async () => value});
const player = {id: 'peer', name: 'Another Player', sport: 'Football', initials: 'AP', avatar: ''};
const overview = (values = {}) => ({currentUserId: 'owner', friends: [], incoming: [], outgoing: [], ...values});
const directory = (friendship = 'none', requestId = null) => ({currentUserId: 'owner', players: [{...player, friendship, requestId}]});
const pending = {id: 'request-1', player, senderId: 'owner', recipientId: 'peer', status: 'pending'};

function deferred() {
  let resolve;
  const promise = new Promise(accept => { resolve = accept; });
  return {promise, resolve};
}

// A small DOM fixture runs the whole module and parses its rendered controls.
// These tests exercise API failures and ordering without needing Chromium.
function element(tag = 'div', initial = {}) {
  const attrs = {...initial}, classes = new Set(), events = {};
  const node = {
    tag, attrs, dataset: {}, children: [], hidden: false, disabled: 'disabled' in attrs,
    classList: {contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name)},
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute(name) { return attrs[name] ?? null; },
    hasAttribute(name) { return name in attrs; },
    addEventListener(name, handler) { events[name] = handler; },
    append(child) { this.children.push(child); },
    prepend(child) { this.children.unshift(child); },
    contains(active) { return active === this || this.children.includes(active) || this.buttons?.includes(active); },
    focus() {}, remove() { this.removed = true; },
    closest(selector) { return selector === 'button' && tag === 'button' ? this : null; },
    showModal() { this.open = true; },
    close() { this.open = false; events.close?.(); }
  };
  for (const [key, value] of Object.entries(attrs)) if (key.startsWith('data-')) node.dataset[key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
  Object.defineProperty(node, 'innerHTML', {
    get() { return this.markup || ''; },
    set(markup) {
      this.markup = markup;
      this.buttons = [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(match => {
        const attributes = {};
        for (const attr of match[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attributes[attr[1]] = attr[2] || '';
        const button = element('button', attributes);
        button.textContent = match[2].replace(/<[^>]+>/g, '');
        return button;
      });
    }
  });
  node.querySelectorAll = selector => {
    const found = [node, ...(node.buttons || []), ...node.children];
    const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attr) return found.filter(item => item.hasAttribute(attr[1]) && (attr[2] === undefined || item.getAttribute(attr[1]) === attr[2]));
    return [];
  };
  node.querySelector = selector => {
    if (selector === '.friends-badge') return node.badge ||= element();
    if (selector === '.friends-tab-count') return node.count ||= element();
    if (selector === '.friends-profile-actions' || selector === '.friends-summary') return node.children.find(child => child.className === selector.slice(1)) || null;
    return node.querySelectorAll(selector)[0] || null;
  };
  return node;
}

async function friendsPage({getOverview, getPlayers, post, profile = true, globals = {}} = {}) {
  const calls = [], clicks = [], notifications = [], body = element('body'), topbar = element('header'), profileActions = element(), content = element();
  const dialog = element('dialog'), dialogContent = element(), searchLabel = element(), search = element('input');
  let observer;
  const queryDialog = dialog.querySelector;
  dialog.querySelector = selector => {
    if (selector === '[data-friends-content]') return dialogContent;
    if (selector === '.friends-search') return searchLabel;
    if (selector === '#friends-player-search') return search;
    return queryDialog(selector) || dialogContent.querySelector(selector);
  };
  topbar.insertBefore = button => { topbar.trigger = button; };
  const context = {
    console, AbortController, setTimeout, clearTimeout, setInterval() {},
    account: {userId: 'owner'}, accountReady: Promise.resolve(),
    view: profile ? 'player' : 'ring', arena: {route: 'player/peer/moments', data: {currentUserId: 'owner', players: []}, request: 0},
    playerHub: {profiles: new Map([['peer', {registeredPlayer: true}]]), errors: new Map(), revision: 0},
    render() {}, toast: message => notifications.push(message),
    MutationObserver: class {constructor(callback) { observer = callback; } observe() {}},
    document: {
      body, activeElement: body, visibilityState: 'visible',
      createElement: tag => tag === 'dialog' ? dialog : element(tag),
      addEventListener(name, handler) { if (name === 'click') clicks.push(handler); },
      querySelector(selector) {
        if (selector === '.topbar') return topbar;
        if (selector === '.hub-profile-actions') return profile ? profileActions : null;
        if (selector === '#content') return content;
        return null;
      },
      querySelectorAll() { return [profileActions.querySelector('.friends-profile-actions')].filter(Boolean); }
    },
    fetch(url, options) {
      calls.push({url, options, payload: options.body ? JSON.parse(options.body) : null});
      if (options.method === 'POST') return Promise.resolve(post ? post(url, JSON.parse(options.body)) : response(overview({outgoing: [pending]}), 201));
      if (url.includes('/players?')) return Promise.resolve(getPlayers ? getPlayers(url) : response(directory()));
      return Promise.resolve(getOverview ? getOverview() : response(overview()));
    },
    ...globals
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(script, context);
  await tick();
  return {
    context, calls, dialog, dialogContent, profileActions, notifications, content,
    async open(tab = 'people') { await context.RingFriends.open(tab); await tick(); },
    button(action, region = dialogContent) { return region.querySelector(`[data-friend-action="${action}"]`); },
    async click(action, region = dialogContent) {
      const button = this.button(action, region);
      assert.ok(button, `Missing ${action} control in ${region.innerHTML}`);
      assert.equal(button.disabled, false);
      clicks.forEach(handler => handler({target: button, preventDefault() {}}));
      await tick();
    },
    expire() { context.account.userId = null; body.classList.add('account-visible'); observer(); }
  };
}

const outage = () => response({error: 'Friends overview temporarily unavailable'}, 503);

test('Home visibly offers Friend requests without finding the topbar icon', async () => {
  const page = await friendsPage({profile: false});
  const summary = page.content.querySelector('.friends-summary');
  assert.ok(summary);
  assert.match(summary.innerHTML, /Friends &amp; requests/);
  assert.equal(summary.querySelector('[data-friends-open="requests"]').textContent, 'Friend requests');
  assert.ok(summary.querySelector('[data-friends-open="people"]'));
});

test('directory and profile Add friend stay enabled when the overview fails', async () => {
  const mutation = deferred();
  const page = await friendsPage({getOverview: outage, post: () => mutation.promise});
  await page.open();
  assert.match(page.dialogContent.innerHTML, /role="alert"/);
  assert.match(page.dialogContent.innerHTML, /data-friends-retry="overview"/);
  assert.equal(page.button('send').disabled, false);
  const profile = page.profileActions.querySelector('.friends-profile-actions');
  assert.equal(page.button('send', profile).disabled, false);
  await page.click('send', profile);
  assert.equal(page.button('send').disabled, true, 'Block double clicks while sending');
  const calls = page.calls.filter(call => call.options.method === 'POST');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/friends/requests');
  assert.deepEqual(calls[0].payload, {playerId: 'peer'});
  assert.equal(calls[0].options.headers['X-Dhoyo-Request'], '1');
  mutation.resolve(response(overview({outgoing: [pending]}), 201));
  await tick();
  assert.ok(page.button('cancel'));
  assert.ok(page.button('cancel', profile));
  assert.deepEqual(page.notifications, ['Friend request sent.']);
});

test('directory relationship state exposes Accept during an overview outage', async () => {
  let accepted = false;
  const page = await friendsPage({getOverview: outage, getPlayers: () => response(directory(accepted ? 'friends' : 'incoming', 'request-1')), post: (url, payload) => {
    assert.equal(url, '/api/friends/requests/request-1');
    assert.deepEqual(payload, {action: 'accept'});
    accepted = true;
    return response(overview({friends: [{...player, requestId: 'request-1'}]}));
  }});
  await page.open();
  assert.equal(page.button('send'), null);
  assert.equal(page.button('accept').disabled, false);
  await page.click('accept');
  assert.match(page.dialogContent.innerHTML, /Friends/);
  assert.equal(page.button('accept'), null);
});

test('an older overview cannot overwrite a newer directory relationship', async () => {
  const older = deferred();
  const page = await friendsPage({getOverview: () => older.promise, getPlayers: () => response(directory('incoming', 'request-1'))});
  assert.ok(page.button('accept'));
  older.resolve(response(overview()));
  await tick();
  assert.ok(page.button('accept'));
  assert.equal(page.button('send'), null);
});

test('a delayed directory response cannot undo a completed send', async () => {
  const older = deferred();
  const page = await friendsPage({getPlayers: () => older.promise});
  const profile = page.profileActions.querySelector('.friends-profile-actions');
  await page.click('send', profile);
  assert.ok(page.button('cancel', profile));
  older.resolve(response(directory('none')));
  await tick();
  assert.ok(page.button('cancel', profile));
  assert.equal(page.button('send', profile), null);
});

test('a changed request refreshes its relationship after a conflict', async () => {
  let changed = false;
  const incoming = {...pending, senderId: 'peer', recipientId: 'owner'};
  const page = await friendsPage({
    getOverview: () => response(overview(changed ? {incoming: [incoming]} : {})),
    getPlayers: () => response(directory(changed ? 'incoming' : 'none', changed ? 'request-1' : null)),
    post: () => { changed = true; return response({error: 'A friend request is already pending'}, 409); }
  });
  await page.open();
  await page.click('send');
  await tick();
  assert.ok(page.button('accept'));
  assert.equal(page.button('send'), null);
  assert.equal(page.notifications.length, 0, 'Do not announce failed sends as successful');
});

test('session expiry rejects delayed sends and removes private relationship controls', async () => {
  const mutation = deferred();
  const page = await friendsPage({post: () => mutation.promise});
  await page.open();
  await page.click('send');
  page.expire();
  mutation.resolve(response(overview({outgoing: [pending]}), 201));
  await tick();
  assert.equal(page.dialog.open, false);
  assert.equal(page.button('cancel'), null);
  assert.equal(page.notifications.length, 0);
});

test('media invalidation immediately purges peers while preserving owner access', async () => {
  const secret = 'data:image/png;base64,PRIVATE';
  const own = {id: 'owner', avatar: secret, cover: secret, image: secret, canViewPhotos: true};
  const peer = {...player, avatar: secret, cover: secret, image: secret, canViewPhotos: true};
  const feed = {posts: [{authorId: 'peer', image: secret, avatar: secret}, {authorId: 'owner', image: secret}]};
  const arena = {route: 'player/peer/moments', request: 0, data: {currentUserId: 'owner', players: [own, peer]}};
  const social = {request: 0, stories: [{authorId: 'peer', image: secret}, {authorId: 'owner', image: secret}]};
  const page = await friendsPage({globals: {state: feed, arena, social}});
  const oldRevision = page.context.playerHub.revision;
  const refreshed = page.context.RingFriends.invalidateMedia(['peer', 'owner']);
  assert.equal(peer.avatar, '');
  assert.equal(peer.cover, '');
  assert.equal(peer.image, '');
  assert.equal(peer.canViewPhotos, false);
  assert.equal(feed.posts[0].image, '');
  assert.equal(feed.posts[0].avatar, '');
  assert.deepEqual(social.stories.map(story => story.authorId), ['owner']);
  assert.equal(own.avatar, secret);
  assert.equal(own.canViewPhotos, true);
  assert.equal(feed.posts[1].image, secret);
  assert.ok(page.context.playerHub.revision > oldRevision);
  assert.equal(page.context.playerHub.profiles.size, 0);
  assert.equal(arena.request, 1);
  assert.equal(social.request, 1);
  await refreshed;
});
