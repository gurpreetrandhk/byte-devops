"""Persistent social demo: visitors share one identity, not authenticated accounts."""
import json
import math
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from uuid import uuid4

from flask import Blueprint, jsonify, request

social = Blueprint('social', __name__, url_prefix='/api/social')
SPORTS = {'Football', 'Cricket', 'Basketball', 'Badminton', 'Tennis', 'Running', 'Esports', 'Swimming', 'Volleyball'}


def now():
    return datetime.now(timezone.utc)


def seed():
    entries = [
        ('Maya Rao', 'Football', 'Bengaluru', 'Floodlights on. Phones away. Nothing beats a five-a-side finish with this crew.', 'photo-1574629810360-7efbbe195018', 860, 90),
        ('Arjun Patel', 'Cricket', 'Bengaluru', 'A straight drive and a perfect Sunday. Who is joining nets this weekend?', 'photo-1540747913346-19e32dc3e97e', 360, 35),
        ('Neha Singh', 'Basketball', 'Mumbai', 'One more shot after everyone leaves. Putting in the work for the city league.', 'photo-1546519638-68e109498ffc', 130, 12),
        ('Pixel United', 'Esports', 'Bengaluru', 'From ranked nights to our first tournament final. This team never gives up.', 'photo-1542751371-adc38448a05e', 55, 4),
        ('Rohan Das', 'Tennis', 'Delhi', 'Early court, fresh strings, and a new doubles partner. Match day is here.', 'photo-1554068865-24cecd4e34b8', 16, 1),
        ('Sara Khan', 'Running', 'Bengaluru', 'Six sunrise kilometres around the lake. The best part was the company.', 'photo-1552674605-db6ffd4facb5', 190, 18),
        ('Aditi Shah', 'Badminton', 'Bengaluru', 'A comeback from match point down. Every rally counts.', 'photo-1622279457486-62dcc4a431d6', 75, 5),
    ]
    posts = []
    for index, (name, sport, city, text, asset, likes, saves) in enumerate(entries):
        posts.append(dict(id=str(index + 1), authorId='athlete-' + str(index + 1), name=name,
                          initials=''.join(word[0] for word in name.split()), sport=sport, city=city,
                          text=text, image='https://images.unsplash.com/' + asset + '?auto=format&fit=crop&w=1200&q=85',
                          likes=likes, baseSaves=saves, comments=[], liked=False, saved=False,
                          createdAt=(now() - timedelta(hours=index * 2 + 1)).isoformat()))
    stories = [dict(id='story-' + p['id'], name=p['name'], initials=p['initials'], image=p['image'],
                    sport=p['sport'], text=p['text'], expiresAt=(now() + timedelta(hours=24)).isoformat()) for p in posts[:6]]
    return dict(posts=posts, stories=stories, preferences=dict(sports=['Football', 'Esports'], city='Bengaluru', following=['Maya Rao', 'Pixel United']))


@contextmanager
def state():
    if not os.environ.get("SPORTSPACE_SOCIAL_DB"):
        from db import sportspace_state
        with sportspace_state(seed) as data:
            yield data
        return
    # Explicit SQLite override for isolated tests and offline development.
    connection = sqlite3.connect(os.environ.get('SPORTSPACE_SOCIAL_DB', '/tmp/sportspace-social.sqlite3'), timeout=10)
    try:
        connection.execute('CREATE TABLE IF NOT EXISTS demo_state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)')
        connection.execute('BEGIN IMMEDIATE')
        row = connection.execute('SELECT payload FROM demo_state WHERE id = 1').fetchone()
        data = json.loads(row[0]) if row else seed()
        yield data
        connection.execute('INSERT OR REPLACE INTO demo_state VALUES (1, ?)', (json.dumps(data),))
        connection.commit()
    finally:
        connection.close()


def rank(post, data=None):
    if data is None:
        return None
    from arena import ensure_arena, player_rank
    player = next((p for p in ensure_arena(data)['players'] if p['id'] == post.get('authorId')), None)
    return player_rank(player) if player else None


def public(post, data):
    from arena import ensure_arena
    player = next((p for p in ensure_arena(data)['players'] if p['id'] == post.get('authorId')), None)
    identity = {key: player[key] for key in ('name', 'initials')} if player else {}
    return {**{key: value for key, value in post.items() if key != 'baseSaves'}, **identity, 'avatar': player.get('avatar', '') if player else '', 'rank': rank(post, data), 'time': post['createdAt']}


def active_stories(data):
    return [story for story in data['stories'] if datetime.fromisoformat(story['expiresAt']) > now()]


def body():
    value = request.get_json(silent=True)
    return value if isinstance(value, dict) else {}


def string(value, maximum):
    return isinstance(value, str) and 0 < len(value.strip()) <= maximum


def valid_sport(value):
    return isinstance(value, str) and value in SPORTS


@social.get('/feed')
def feed():
    mode = request.args.get('mode', 'for-you')
    if mode not in ('for-you', 'following', 'local'):
        return jsonify(error='Unknown feed mode'), 400
    with state() as data:
        preferences = data['preferences']
        city = request.args.get('city', preferences['city']).strip()
        sport = request.args.get('sport', 'All sports')
        query = request.args.get('q', '').casefold().strip()
        scored_at = now()
        from arena import discovery_influence, ensure_arena
        _, influence_sources = discovery_influence(ensure_arena(data))

        def discovery_sources(post):
            if mode == 'following':
                return []
            return [source for source in influence_sources.get(post['authorId'], [])
                    if source['sport'] == post['sport'] and source['boost'] > 0]

        def discovery_boost(post):
            return max((source['boost'] for source in discovery_sources(post)), default=0)

        affinity = {sport: 6 for sport in preferences['sports']}
        for post in data['posts']:
            affinity[post['sport']] = min(18, affinity.get(post['sport'], 0) + int(post['liked']) * 2 + int(post['saved']) * 3 + min(3, sum(c['name'] == 'You' for c in post['comments'])))

        def score(post):
            hours = max(0, (scored_at - datetime.fromisoformat(post['createdAt'])).total_seconds() / 3600)
            locality = post['city'].casefold() == city.casefold()
            tier = {None: 0, 'Silver': 1, 'Gold': 2, 'Diamond': 3, 'Star': 4}[rank(post, data)]
            return (affinity.get(post['sport'], 0) if mode == 'for-you' else 0) + 5 * (post['name'] in preferences['following']) + 12 / (1 + hours / 12) + locality * (2 + tier * 1.5) + min(4, math.log1p(post['likes']) / 2) + discovery_boost(post)

        posts = [post for post in data['posts'] if
                 (sport in ('All sports', 'All', '') or post['sport'].casefold() == sport.casefold()) and
                 (not query or query in ' '.join([post['text'], post['name'], post['sport'], post['city']]).casefold()) and
                 (mode != 'following' or post['name'] in preferences['following']) and
                 (mode != 'local' or post['city'].casefold() == city.casefold())]
        posts.sort(key=lambda post: (-score(post), post['id']))
        return jsonify(posts=[{**public(post, data), 'discoveryBoost': discovery_boost(post),
                               'discoverySources': [source for source in discovery_sources(post)
                                                    if source['boost'] == discovery_boost(post)]}
                              for post in posts], stories=active_stories(data), preferences=preferences)


@social.route('/preferences', methods=['GET', 'PATCH'])
def preferences():
    payload = body()
    if request.method == 'PATCH':
        if 'sports' in payload and (not isinstance(payload['sports'], list) or any(not isinstance(sport, str) or sport not in SPORTS for sport in payload['sports']) or len(payload['sports']) > len(SPORTS)):
            return jsonify(error='Choose valid sports'), 400
        if 'city' in payload and not string(payload['city'], 80):
            return jsonify(error='City is required (maximum 80 characters)'), 400
    with state() as data:
        if request.method == 'PATCH':
            for key in ('sports', 'city'):
                if key in payload:
                    data['preferences'][key] = payload[key].strip() if key == 'city' else list(dict.fromkeys(payload[key]))
        return jsonify(data['preferences'])


@social.post('/posts')
def create_post():
    payload = body()
    if not string(payload.get('text'), 3000) or not valid_sport(payload.get('sport')):
        return jsonify(error='Text (1-3000 characters) and a valid sport are required'), 400
    with state() as data:
        community = None
        if 'communityId' in payload:
            from arena import ensure_arena
            community_id = payload['communityId']
            if isinstance(community_id, str):
                community = next((item for item in ensure_arena(data)['communities'] if item['id'] == community_id), None)
            if community is None:
                return jsonify(error='Arena not found'), 404
            if payload['sport'] != community['sport']:
                return jsonify(error='Post sport must match the Arena sport'), 400
        post = dict(id=uuid4().hex, authorId='demo-user', name='You', initials='YO', sport=payload['sport'],
                    text=payload['text'].strip(), image='', likes=0, baseSaves=0, comments=[], liked=False, saved=False,
                    city=community['city'] if community else data['preferences']['city'], createdAt=now().isoformat())
        if community:
            post['communityId'] = community['id']
        data['posts'].append(post)
        return jsonify(public(post, data)), 201


@social.post('/posts/<post_id>/<action>')
def engage(post_id, action):
    if action not in ('like', 'save', 'comments'):
        return jsonify(error='Unknown action'), 404
    payload = body()
    if action == 'comments' and not string(payload.get('text'), 1000):
        return jsonify(error='Comment must contain 1-1000 characters'), 400
    with state() as data:
        post = next((p for p in data['posts'] if p['id'] == post_id), None)
        if post is None:
            return jsonify(error='Post not found'), 404
        if action == 'like':
            post['liked'] = not post['liked']
            post['likes'] += 1 if post['liked'] else -1
        elif action == 'save':
            post['saved'] = not post['saved']
        else:
            post['comments'].append(dict(name='You', text=payload['text'].strip()))
        return jsonify(public(post, data))


@social.post('/follow')
def follow():
    name = body().get('name')
    if not string(name, 100) or name == 'You':
        return jsonify(error='A valid athlete name is required'), 400
    with state() as data:
        if name not in {p['name'] for p in data['posts']}:
            return jsonify(error='Athlete not found'), 404
        following = data['preferences']['following']
        following.remove(name) if name in following else following.append(name)
        return jsonify(data['preferences'])


@social.route('/stories', methods=['GET', 'POST'])
def stories():
    payload = body()
    if request.method == 'POST':
        image = payload.get('image')
        try:
            url = urlparse(image) if isinstance(image, str) else None
            valid_url = url is not None and url.scheme in ('http', 'https') and bool(url.hostname) and not url.username and len(image) <= 2048
        except ValueError:
            valid_url = False
        if not valid_url or not valid_sport(payload.get('sport')) or not isinstance(payload.get('text', ''), str) or len(payload.get('text', '')) > 500:
            return jsonify(error='A valid HTTP(S) image URL, sport, and text up to 500 characters are required'), 400
    with state() as data:
        if request.method == 'GET':
            return jsonify(stories=active_stories(data))
        from arena import ensure_arena, CURRENT_USER
        player = next(p for p in ensure_arena(data)['players'] if p['id'] == CURRENT_USER)
        story = dict(id=uuid4().hex, authorId=CURRENT_USER, name=player['name'], initials=player['initials'], image=payload['image'], sport=payload['sport'], text=payload.get('text', '').strip(), expiresAt=(now() + timedelta(hours=24)).isoformat())
        data['stories'].append(story)
        return jsonify(story), 201
