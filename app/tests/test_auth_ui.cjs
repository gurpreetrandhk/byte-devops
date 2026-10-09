const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const script = readFileSync(path.join(__dirname, '../static/sportspace/auth-ui.js'), 'utf8');
const response = (value, status = 200) => ({status, ok: status < 400, json: async () => value});
const tick = () => new Promise(resolve => setImmediate(resolve));

function deferred() {
  let resolve, reject;
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline; });
  return {promise, resolve, reject};
}

// These fixtures model only the DOM operations used by account access. Parsing
// rendered tags lets the tests inspect form semantics without matching JS source.
function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    result[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return result;
}

function element(initial = {}) {
  const attrs = {...initial};
  return {
    attrs, isConnected: true, disabled: false, textContent: '', innerHTML: '',
    classList: {add() {}, remove() {}, toggle() {}},
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute(name) { return attrs[name] ?? null; },
    append() {}, focus() {},
    remove() { this.isConnected = false; }
  };
}

function accountOverlay(events) {
  const overlay = element();
  Object.defineProperty(overlay, 'innerHTML', {
    get() { return this.markup; },
    set(markup) {
      this.markup = markup;
      const form = element(attributes(markup.match(/<form\b([^>]*)>/)[1]));
      form.fields = [...markup.matchAll(/<input\b([^>]*)>/g)].map(match => {
        const field = element(attributes(match[1]));
        field.name = field.attrs.name;
        field.value = '';
        field.type = field.attrs.type || 'text';
        return field;
      });
      form.submit = element({type: 'submit'});
      form.submit.label = element();
      form.submit.querySelector = selector => selector === 'span' ? form.submit.label : null;
      form.error = element({role: 'alert'});
      form.switch = element();
      form.modes = ['login', 'register'].map(mode => ({...element(), dataset: {accountMode: mode}}));
      form.passwordToggle = element();
      form.querySelector = selector => {
        if (selector === '[type=submit]' || selector === '.account-submit') return form.submit;
        if (selector === '.account-error') return form.error;
        const name = selector.match(/^\[name=["']?([^"'\]]+)["']?\]$/)?.[1];
        return form.fields.find(field => field.name === name) || null;
      };
      form.querySelectorAll = () => [...form.modes, form.switch];
      form.remove = () => { form.isConnected = false; events.push('form removed'); };
      this.form = form;
      this.stickers = element();
      this.stickers.closest = () => element();
    }
  });
  overlay.querySelector = selector => {
    if (selector === 'form' || selector === '.account-form') return overlay.form;
    if (selector === '.account-error') return overlay.form.error;
    if (selector === '.account-switch') return overlay.form.switch;
    if (selector === '.account-password-toggle') return overlay.form.passwordToggle;
    if (selector === '.account-sticker-strip') return overlay.stickers;
    return overlay.form.querySelector(selector);
  };
  overlay.querySelectorAll = () => overlay.form.modes;
  return overlay;
}

async function accountPage({register = false, authenticate, store, secure = true, credentialAPI = true, constructorError = false, credentialsAPI = true} = {}) {
  const events = [], requests = [], stored = [], navigations = [];
  let overlay, formDataReads = 0;
  const context = {
    isSecureContext: secure,
    document: {
      querySelectorAll: () => [],
      querySelector: () => element(),
      getElementById: () => overlay,
      createElement: () => { overlay = accountOverlay(events); return overlay; },
      body: {...element(), append() {}}
    },
    RingStickers: {ready: Promise.resolve([])},
    matchMedia: () => ({matches: false}),
    FormData: class {
      constructor(form) {
        formDataReads++;
        this.values = form.fields.map(field => [field.name, field.value]);
      }
      [Symbol.iterator]() { return this.values[Symbol.iterator](); }
    },
    fetch: async (url, options = {}) => {
      if (url === '/api/auth/me') return response({userId: null});
      const request = {url, payload: JSON.parse(options.body)};
      requests.push(request);
      events.push('authentication requested');
      const result = authenticate ? await authenticate(request) : response({userId: 'player-123'});
      events.push('authentication returned');
      return result;
    },
    location: {
      replace(target) { navigations.push(target); events.push('navigate'); },
      reload() { assert.fail('Account access should perform one clear navigation after success'); }
    },
    navigator: credentialsAPI ? {credentials: {
      async store(credential) {
        stored.push(credential);
        events.push('password storage requested');
        if (store) await store(credential);
        events.push('password storage returned');
      }
    }} : {}
  };
  if (credentialAPI) context.PasswordCredential = class {
    constructor(data) {
      if (constructorError) throw new Error('Credential API unavailable');
      Object.assign(this, data);
    }
  };
  context.window = context;
  vm.runInNewContext(script, context, {filename: 'auth-ui.js'});
  await tick();
  if (register) overlay.form.modes.find(button => button.dataset.accountMode === 'register').onclick();
  const form = overlay.form;
  return {
    context, form, events, requests, stored, navigations,
    get formDataReads() { return formDataReads; },
    fill(values) {
      for (const [name, value] of Object.entries(values)) {
        const field = form.fields.find(item => item.name === name);
        assert.ok(field, `Missing ${name} field`);
        field.value = value;
      }
    },
    submit() {
      let prevented = false;
      const pending = form.onsubmit({target: form, preventDefault() { prevented = true; }});
      assert.equal(prevented, true);
      return pending;
    }
  };
}

for (const register of [false, true]) {
  const mode = register ? 'registration' : 'login';
  test(`${mode} identifies its credential fields for browser password managers`, async () => {
    const page = await accountPage({register});
    assert.equal(page.form.getAttribute('id'), register ? 'account-register-form' : 'account-login-form');
    assert.equal(page.form.getAttribute('method'), 'post');
    assert.equal(page.form.getAttribute('action'), '/api/auth/' + (register ? 'register' : 'login'));
    assert.equal(page.form.getAttribute('autocomplete'), 'on');
    assert.equal(page.form.querySelector('[name="email"]').getAttribute('autocomplete'), 'username');
    assert.equal(page.form.querySelector('[name="password"]').getAttribute('autocomplete'), register ? 'new-password' : 'current-password');
  });

  test(`${mode} saves the authenticated submission before navigation`, async () => {
    const auth = deferred(), storage = deferred();
    const page = await accountPage({register, authenticate: () => auth.promise, store: () => storage.promise});
    const values = {email: '  Player@example.com  ', password: '  long-password-123  '};
    if (register) values.name = '  Player Name  ';
    page.fill(values);
    const submitted = page.submit();
    assert.equal(page.form.submit.disabled, true);
    assert.equal(page.form.getAttribute('aria-busy'), 'true');
    assert.equal(page.formDataReads, 1);
    assert.equal(page.requests[0].url, '/api/auth/' + (register ? 'register' : 'login'));
    assert.equal(page.requests[0].payload.email, values.email);
    assert.equal(page.requests[0].payload.password, values.password);
    assert.equal(page.stored.length, 0, 'Unconfirmed passwords must never reach the browser store');
    assert.deepEqual(page.navigations, []);
    page.fill({email: 'different@example.com', password: 'changed-password-123'});
    auth.resolve(response({userId: 'player-123'}));
    await tick();
    assert.equal(page.stored.length, 1);
    assert.equal(page.stored[0].id, values.email.trim());
    assert.equal(page.stored[0].password, values.password, 'Keep every character of the submitted password');
    assert.equal(page.stored[0].name, register ? values.name.trim() : undefined);
    assert.deepEqual(page.navigations, [], 'Wait for the browser store before leaving the form');
    storage.resolve();
    await submitted;
    assert.deepEqual(page.navigations, ['/ring#ring']);
    assert.equal(page.form.isConnected, false);
    assert.deepEqual(page.events, ['authentication requested', 'authentication returned', 'password storage requested', 'password storage returned', 'form removed', 'navigate']);
    assert.equal(page.formDataReads, 1, 'Credential storage must reuse the authenticated submission');
  });

  test(`${mode} leaves rejected credentials unsaved and allows correction`, async () => {
    const page = await accountPage({register, authenticate: () => response({error: 'Credentials rejected'}, register ? 409 : 401)});
    page.fill({email: 'player@example.com', password: 'incorrect-password-123'});
    await page.submit();
    assert.equal(page.form.error.textContent, 'Credentials rejected');
    assert.equal(page.form.submit.disabled, false);
    assert.equal(page.form.getAttribute('aria-busy'), 'false');
    assert.ok(page.form.querySelectorAll().every(button => !button.disabled));
    assert.equal(page.form.isConnected, true);
    assert.equal(page.stored.length, 0);
    assert.deepEqual(page.navigations, []);
  });
}

test('password manager limitations never undo successful authentication', async t => {
  const cases = [
    ['PasswordCredential is unsupported', {credentialAPI: false}],
    ['credential storage is unsupported', {credentialsAPI: false}],
    ['the page is not a secure context', {secure: false}],
    ['the credential constructor throws', {constructorError: true}],
    ['the browser rejects password storage', {store: () => Promise.reject(new Error('Storage declined'))}]
  ];
  for (const [name, options] of cases) {
    await t.test(name, async () => {
      const page = await accountPage(options);
      page.fill({email: 'player@example.com', password: 'long-password-123'});
      await page.submit();
      assert.deepEqual(page.navigations, ['/ring#ring']);
      assert.equal(page.form.isConnected, false);
      assert.equal(page.form.error.textContent, '');
      if (!options.store) assert.equal(page.stored.length, 0);
    });
  }
});
