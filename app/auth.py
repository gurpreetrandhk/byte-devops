"""Opaque, revocable database sessions and password-hashed player accounts."""
import hashlib
import secrets
import time
from urllib.parse import urlsplit
from flask import Blueprint, g, request, jsonify, current_app, has_request_context
from werkzeug.security import generate_password_hash, check_password_hash

auth = Blueprint('auth', __name__, url_prefix='/api/auth')
COOKIE = 'dhoyo_session'
LIFETIME = 7 * 86400


def current_user_id():
    if has_request_context():
        return getattr(g, 'user_id', 'demo-user' if current_app.config.get('AUTH_TEST_DEMO') else None)
    return 'demo-user'


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def install_auth(app):
    app.register_blueprint(auth)

    @app.before_request
    def authenticate():
        if not (request.path.startswith('/api/') or request.path == '/users'):
            return
        if current_app.config.get('AUTH_TEST_DEMO'):
            g.user_id = 'demo-user'
            return
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            origin = request.headers.get('Origin')
            if request.headers.get('Sec-Fetch-Site') == 'cross-site' or (origin and urlsplit(origin).netloc != request.host):
                return jsonify(error='Please submit from this website'), 403
            if not request.is_json or request.headers.get('X-Dhoyo-Request') != '1':
                return jsonify(error='JSON and X-Dhoyo-Request header required'), 403
        g.user_id = None
        token = request.cookies.get(COOKIE)
        if token:
            from social import raw_state
            with raw_state() as data:
                session = data.get('sessions', {}).get(digest(token))
                if session and session['expires'] > time.time():
                    g.user_id = session['user_id']
        if request.path.startswith('/api/auth/'):
            return
        if not g.user_id:
            return jsonify(error='Sign in to continue'), 401
        if request.path == '/users':
            return jsonify(error='Use your own player profile'), 403
        if request.path == '/api/arena/awards':
            return jsonify(error='Organizer access is not enabled for player accounts'), 403


def session_response(data, player_id):
    token = secrets.token_urlsafe(32)
    sessions = data.setdefault('sessions', {})
    for key in list(sessions):
        if sessions[key]['expires'] < time.time():
            del sessions[key]
    previous = request.cookies.get(COOKIE)
    if previous:
        sessions.pop(digest(previous), None)
    sessions[digest(token)] = dict(user_id=player_id, expires=time.time() + LIFETIME)
    response = jsonify(userId=player_id)
    response.set_cookie(COOKIE, token, max_age=LIFETIME, httponly=True,
                        secure=request.is_secure or current_app.config.get('AUTH_COOKIE_SECURE', False), samesite='Lax', path='/')
    return response


@auth.get('/me')
def me():
    return jsonify(userId=current_user_id())


@auth.post('/register')
def register():
    from social import raw_state, body, string, SPORTS
    from arena import ensure_arena
    payload = body()
    name, email, password = payload.get('name'), payload.get('email'), payload.get('password')
    if not string(name, 100) or not isinstance(email, str) or len(email) > 254 or '@' not in email or '.' not in email.rsplit('@', 1)[-1] or any(c.isspace() for c in email):
        return jsonify(error='Enter your name and a valid email address'), 400
    if not isinstance(password, str) or not 10 <= len(password) <= 128:
        return jsonify(error='Use a password between 10 and 128 characters'), 400
    if payload.get('sport') not in SPORTS or any(not string(payload.get(k), 80) for k in ('city', 'state', 'country')):
        return jsonify(error='Choose your sport and enter your city, state and country'), 400
    email = email.strip().casefold()
    password_hash = generate_password_hash(password)
    with raw_state() as data:
        accounts = data.setdefault('accounts', {})
        if email in accounts:
            return jsonify(error='An account with this email already exists. Sign in instead.'), 409
        players = ensure_arena(data)['players']
        player_id = 'player-' + secrets.token_hex(12)
        accounts[email] = dict(player_id=player_id, password_hash=password_hash)
        player = dict(id=player_id, name=name.strip(), initials=''.join(w[0] for w in name.split())[:2].upper(),
                      image='', avatar='', bio='', awards=dict(Star=0, Diamond=0, Gold=0, Silver=0),
                      gamesPlayed=0, wins=0, supporters=[], teamId=None)
        player.update({k: payload[k].strip() for k in ('city', 'state', 'country', 'sport')})
        players.append(player)
        data.setdefault('userPreferences', {})[player_id] = dict(sports=[player['sport']], following=[], **{k: player[k] for k in ('city', 'state', 'country')})
        return session_response(data, player_id), 201


@auth.post('/login')
def login():
    from social import raw_state, body
    payload = body()
    email, password = payload.get('email'), payload.get('password')
    if not isinstance(email, str) or not isinstance(password, str) or len(email) > 254 or len(password) > 128:
        return jsonify(error='Email or password is incorrect'), 401
    with raw_state() as data:
        # Shared across workers, keyed by email and client address; never stores passwords.
        key = digest(email.strip().casefold() + '|' + (request.remote_addr or ''))
        attempts = data.setdefault('loginAttempts', {})
        for old in list(attempts):
            if attempts[old]['until'] < time.time():
                del attempts[old]
        attempt = attempts.setdefault(key, dict(count=0, until=time.time() + 900))
        if attempt['count'] >= 10:
            return jsonify(error='Too many attempts. Try again in 15 minutes.'), 429
        account = data.get('accounts', {}).get(email.strip().casefold())
        if not account or not check_password_hash(account['password_hash'], password):
            attempt['count'] += 1
            return jsonify(error='Email or password is incorrect'), 401
        attempts.pop(key, None)
        return session_response(data, account['player_id'])


@auth.post('/logout')
def logout():
    from social import raw_state
    with raw_state() as data:
        data.get('sessions', {}).pop(digest(request.cookies.get(COOKIE, '')), None)
    response = jsonify(ok=True)
    response.delete_cookie(COOKIE, path='/')
    return response
