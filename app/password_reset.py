"""Email ownership verification for single-use, expiring password resets."""
import base64
import json
import os
import re
import secrets
import smtplib
import ssl
import time
from email.message import EmailMessage
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import Request, urlopen

from flask import Blueprint, current_app, jsonify, request
from werkzeug.security import generate_password_hash

from auth import COOKIE, digest


password_reset = Blueprint('password_reset', __name__, url_prefix='/api/auth')
TOKEN_LIFETIME = 30 * 60
RATE_WINDOW = 15 * 60
MAX_RATE_ENTRIES = 2048
REQUEST_MESSAGE = 'If an account exists for that email, a password reset link has been sent.'
UNAVAILABLE_MESSAGE = 'Password reset is temporarily unavailable. Please try again later.'
INVALID_TOKEN_MESSAGE = 'This reset link is invalid or has expired. Request a new link.'


def setting(name, default=None):
    return current_app.config.get(name, os.environ.get(name, default))


def mail_settings():
    """Only the configured public URL may supply the reset link's origin."""
    base_url = setting('PASSWORD_RESET_BASE_URL')
    if not isinstance(base_url, str) or not base_url:
        return None
    try:
        parsed = urlsplit(base_url)
        local_http = parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1', '::1')
        if not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            return None
        if parsed.scheme != 'https' and not local_http:
            return None
        if any(character.isspace() for character in base_url):
            return None
    except (ValueError, TypeError):
        return None
    gmail = {name: setting(name) for name in ('GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN')}
    api_key = setting('RESEND_API_KEY')
    sender = setting('PASSWORD_RESET_FROM') if any(gmail.values()) or api_key else setting('SMTP_FROM')
    if not isinstance(sender, str) or '@' not in sender or any(character in sender for character in '\r\n'):
        return None
    if any(gmail.values()):
        if not all(isinstance(value, str) and value and not any(character.isspace() for character in value)
                   for value in gmail.values()):
            return None
        return dict(provider='gmail', sender=sender, base_url=base_url,
                    client_id=gmail['GMAIL_CLIENT_ID'], client_secret=gmail['GMAIL_CLIENT_SECRET'],
                    refresh_token=gmail['GMAIL_REFRESH_TOKEN'])
    if api_key:
        if not isinstance(api_key, str) or any(character.isspace() for character in api_key):
            return None
        return dict(provider='resend', api_key=api_key, sender=sender, base_url=base_url)
    host = setting('SMTP_HOST')
    if not isinstance(host, str) or not host:
        return None
    try:
        port = int(setting('SMTP_PORT', 587))
        if not 1 <= port <= 65535:
            return None
    except (ValueError, TypeError):
        return None
    username, password = setting('SMTP_USERNAME'), setting('SMTP_PASSWORD')
    if bool(username) != bool(password):
        return None
    tls = str(setting('SMTP_USE_TLS', 'true')).casefold()
    if tls not in ('true', 'false', '1', '0'):
        return None
    return dict(provider='smtp', host=host, port=port, sender=sender, base_url=base_url,
                username=username, password=password, use_tls=tls in ('true', '1'))


def email_text(settings, token):
    reset_url = settings['base_url'] + '#reset-token=' + quote(token, safe='')
    return ('Use this link to choose a new Dhoyo password:\n\n' + reset_url +
            '\n\nThis link expires in 30 minutes and can be used once. '
            'If you did not request a password reset, you can ignore this email.\n')


def email_message(settings, recipient, token):
    message = EmailMessage()
    message['Subject'] = 'Reset your Dhoyo password'
    message['From'] = settings['sender']
    message['To'] = recipient
    message.set_content(email_text(settings, token))
    return message


def json_response(response):
    if not 200 <= response.status < 300:
        raise ValueError('Unexpected delivery response')
    content = response.read(4097)
    if len(content) > 4096:
        raise ValueError('Unexpected delivery response size')
    result = json.loads(content)
    if not isinstance(result, dict):
        raise ValueError('Invalid delivery response')
    return result


def deliver_gmail_reset(settings, recipient, token):
    # Refresh for known and unknown accounts alike so provider authentication
    # failures never reveal which addresses have registered accounts.
    refresh_payload = urlencode(dict(
        client_id=settings['client_id'], client_secret=settings['client_secret'],
        refresh_token=settings['refresh_token'], grant_type='refresh_token'))
    refresh_request = Request('https://oauth2.googleapis.com/token', data=refresh_payload.encode('utf-8'),
                              headers={'Content-Type': 'application/x-www-form-urlencoded'}, method='POST')
    try:
        with urlopen(refresh_request, timeout=10) as response:
            result = json_response(response)
            access_token = result.get('access_token')
            if not isinstance(access_token, str) or not access_token or any(character.isspace() for character in access_token):
                raise ValueError('Invalid provider authentication response')
    except (HTTPError, URLError, OSError, ValueError):
        current_app.logger.warning('Password reset email service unavailable')
        return False, False
    if recipient is None:
        return True, False
    encoded = base64.urlsafe_b64encode(email_message(settings, recipient, token).as_bytes()).decode('ascii')
    send_request = Request('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
                           data=json.dumps({'raw': encoded}).encode('utf-8'),
                           headers={'Authorization': 'Bearer ' + access_token, 'Content-Type': 'application/json'},
                           method='POST')
    try:
        with urlopen(send_request, timeout=10) as response:
            result = json_response(response)
            if not isinstance(result.get('id'), str) or not result['id']:
                raise ValueError('Invalid delivery response')
        return True, True
    except (HTTPError, URLError, OSError, ValueError):
        current_app.logger.warning('Password reset email delivery failed')
        return True, False


def deliver_resend_reset(settings, recipient, token):
    # HTTPS supports hosts that block outbound SMTP. Do not email an unknown
    # account or probe unrelated APIs that require additional key permissions.
    if recipient is None:
        return True, False
    payload = {'from': settings['sender'], 'to': [recipient],
               'subject': 'Reset your Dhoyo password', 'text': email_text(settings, token)}
    send_request = Request('https://api.resend.com/emails', data=json.dumps(payload).encode('utf-8'),
                           headers={'Authorization': 'Bearer ' + settings['api_key'], 'Content-Type': 'application/json'},
                           method='POST')
    try:
        with urlopen(send_request, timeout=10) as response:
            result = json_response(response)
            if not isinstance(result.get('id'), str) or not result['id']:
                raise ValueError('Invalid delivery response')
        return True, True
    except (HTTPError, URLError, OSError, ValueError):
        # Keep the response generic even if the configured provider fails;
        # errors only for registered accounts would reveal account existence.
        current_app.logger.warning('Password reset email delivery failed')
        return True, False


def deliver_password_reset(settings, recipient, token):
    """Deliver without exposing account existence through delivery errors.

    Gmail authentication and SMTP connectivity are checked for all requests.
    A failure during a known account's send retains the generic response.
    Never log a reset URL or provider credentials.
    """
    if settings['provider'] == 'gmail':
        return deliver_gmail_reset(settings, recipient, token)
    if settings['provider'] == 'resend':
        return deliver_resend_reset(settings, recipient, token)
    connection = None
    try:
        connection = smtplib.SMTP(settings['host'], settings['port'], timeout=10)
        if settings['use_tls']:
            connection.starttls(context=ssl.create_default_context())
        if settings['username']:
            connection.login(settings['username'], settings['password'])
    except (OSError, smtplib.SMTPException):
        if connection:
            connection.close()
        current_app.logger.warning('Password reset email service unavailable')
        return False, False
    try:
        if recipient is None:
            return True, False
        connection.send_message(email_message(settings, recipient, token))
        return True, True
    except (OSError, smtplib.SMTPException):
        current_app.logger.warning('Password reset email delivery failed')
        return True, False
    finally:
        connection.close()


def cleanup(data, now):
    tokens = data.setdefault('passwordResetTokens', {})
    for key in list(tokens):
        if tokens[key]['expires'] <= now:
            del tokens[key]
    limits = data.setdefault('passwordResetRateLimits', {})
    for key in list(limits):
        if limits[key]['until'] <= now:
            del limits[key]


def consume_limits(data, specifications, now):
    limits = data['passwordResetRateLimits']
    keys = [(digest(scope), maximum) for scope, maximum in specifications]
    if len(limits) + sum(key not in limits for key, _ in keys) > MAX_RATE_ENTRIES:
        return False
    if any(limits.get(key, {}).get('count', 0) >= maximum for key, maximum in keys):
        return False
    for key, _ in keys:
        entry = limits.setdefault(key, dict(count=0, until=now + RATE_WINDOW))
        entry['count'] += 1
    return True


def rate_limit_response():
    response = jsonify(error='Too many password reset attempts. Try again in 15 minutes.')
    response.headers['Retry-After'] = str(RATE_WINDOW)
    return response, 429


def valid_token(data, token_digest, now):
    record = data.get('passwordResetTokens', {}).get(token_digest)
    if not record or not record.get('active') or record['expires'] <= now:
        return None
    account = data.get('accounts', {}).get(record['email'])
    if not account or account['player_id'] != record['user_id']:
        return None
    return record


@password_reset.post('/forgot-password')
def forgot_password():
    from social import body, raw_state
    email = body().get('email')
    if not isinstance(email, str):
        return jsonify(error='Enter a valid email address'), 400
    email = email.strip().casefold()
    if len(email) > 254 or '@' not in email or '.' not in email.rsplit('@', 1)[-1] or any(character.isspace() for character in email):
        return jsonify(error='Enter a valid email address'), 400
    settings = mail_settings()
    if settings is None:
        return jsonify(error=UNAVAILABLE_MESSAGE), 503
    now = time.time()
    token, token_digest, recipient = None, None, None
    with raw_state() as data:
        cleanup(data, now)
        limits = [('forgot-email:' + email, 3), ('forgot-ip:' + (request.remote_addr or ''), 20)]
        if not consume_limits(data, limits, now):
            return rate_limit_response()
        account = data.get('accounts', {}).get(email)
        if account:
            token = secrets.token_urlsafe(32)
            token_digest, recipient = digest(token), email
            data['passwordResetTokens'][token_digest] = dict(
                email=email, user_id=account['player_id'], expires=now + TOKEN_LIFETIME, active=False)
    # Email transport can block; release the database transaction first.
    available, sent = deliver_password_reset(settings, recipient, token)
    if token_digest:
        with raw_state() as data:
            cleanup(data, time.time())
            tokens = data['passwordResetTokens']
            pending = tokens.get(token_digest)
            if pending and sent:
                for key in list(tokens):
                    if key != token_digest and tokens[key]['user_id'] == pending['user_id']:
                        del tokens[key]
                pending['active'] = True
            elif pending:
                del tokens[token_digest]
    if not available:
        return jsonify(error=UNAVAILABLE_MESSAGE), 503
    return jsonify(message=REQUEST_MESSAGE)


@password_reset.post('/reset-password')
def reset_password():
    from social import body, raw_state
    payload = body()
    token, password = payload.get('token'), payload.get('password')
    if not isinstance(password, str) or not 10 <= len(password) <= 128:
        return jsonify(error='Use a password between 10 and 128 characters'), 400
    token_digest = digest(token) if isinstance(token, str) and re.fullmatch(r'[A-Za-z0-9_-]{43}', token) else None
    with raw_state() as data:
        now = time.time()
        cleanup(data, now)
        if not consume_limits(data, [('reset-ip:' + (request.remote_addr or ''), 10)], now):
            return rate_limit_response()
        if not token_digest or not valid_token(data, token_digest, now):
            return jsonify(error=INVALID_TOKEN_MESSAGE), 400
    password_hash = generate_password_hash(password)
    with raw_state() as data:
        # Recheck after hashing so concurrent reset submissions stay single-use.
        record = valid_token(data, token_digest, time.time())
        if not record:
            return jsonify(error=INVALID_TOKEN_MESSAGE), 400
        email, player_id = record['email'], record['user_id']
        data['accounts'][email]['password_hash'] = password_hash
        tokens = data['passwordResetTokens']
        for key in list(tokens):
            if tokens[key]['user_id'] == player_id:
                del tokens[key]
        sessions = data.get('sessions', {})
        for key in list(sessions):
            if sessions[key]['user_id'] == player_id:
                del sessions[key]
        email_digest = digest(email)
        attempts = data.get('loginAttempts', {})
        for key in list(attempts):
            if attempts[key].get('email_digest') == email_digest:
                del attempts[key]
        attempts.pop(digest(email + '|' + (request.remote_addr or '')), None)
    response = jsonify(message='Your password has been reset. Sign in with your new password.')
    response.delete_cookie(COOKIE, path='/')
    return response
