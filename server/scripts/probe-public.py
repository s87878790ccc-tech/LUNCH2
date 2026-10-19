"""Opt-in, bounded, unauthenticated checks against the owner's two LUNCH2 origins.

No passwords, login attempts, writes, exploit uploads, load tests or third-party
targets. Output contains status/header checks only, never response bodies.
"""
import argparse
import base64
import json
import urllib.error
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--run-authorized', action='store_true')
args = parser.parse_args()
if not args.run_authorized:
    parser.exit(message='Requires --run-authorized after authorization from the site owner.\n')

API = 'https://lunch2.onrender.com'
WEB = 'https://s87878790ccc-tech.github.io/LUNCH2/'
ALLOWED = {'lunch2.onrender.com', 's87878790ccc-tech.github.io'}


class ScopedRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, url):
        if urllib.parse.urlparse(url).hostname not in ALLOWED:
            raise ValueError('Redirect outside authorized scope')
        return super().redirect_request(request, fp, code, msg, headers, url)


def b64(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')


cases = [('frontend headers', WEB, 'GET', {}, [200]),
         ('health', API + '/api/health', 'GET', {}, [200])]
for path in ['/api/users', '/api/orders', '/api/orders/1', '/api/logs',
             '/api/settings/open-window', '/api/reports/unpaid', '/api/seats',
             '/api/preorders/2026-10-20/1']:
    cases.append(('unsigned ' + path, API + path, 'GET', {}, [401]))
for path in ['/.env', '/.git/config', '/server.js', '/logs/access.log',
             '/uploads/..%2Fserver.js', '/uploads/payload.html']:
    cases.append(('exposure ' + path, API + path, 'GET', {}, [404]))
for algorithm, signature in [('none', ''), ('HS256', 'invalid-signature-canary')]:
    forged = b64({'alg': algorithm, 'typ': 'JWT'}) + '.' + b64({'uid': 1, 'role': 'admin', 'exp': 4102444800}) + '.' + signature
    cases.append(('forged JWT ' + algorithm, API + '/api/users', 'GET', {'Authorization': 'Bearer ' + forged}, [401]))
cases += [
    ('cookie cannot grant role', API + '/api/users', 'GET', {'Cookie': 'role=admin; uid=1'}, [401]),
    ('HEAD stays protected', API + '/api/users', 'HEAD', {}, [401]),
    ('invalid seat rejected', API + '/api/orders/0', 'GET', {}, [400]),
    ('query cannot grant role', API + '/api/users?role=admin&__proto__[role]=admin', 'GET', {}, [401, 403]),
    ('untrusted origin rejected', API + '/api/health', 'GET', {'Origin': 'https://untrusted.invalid'}, [403]),
    ('untrusted preflight rejected', API + '/api/users', 'OPTIONS', {'Origin': 'https://untrusted.invalid', 'Access-Control-Request-Method': 'PUT'}, [403]),
    ('trusted preflight', API + '/api/users', 'OPTIONS', {'Origin': 'https://s87878790ccc-tech.github.io', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type'}, [204]),
]
assert len(cases) <= 30
opener = urllib.request.build_opener(ScopedRedirects())
results, consecutive_errors = [], 0
for name, url, method, headers, expected in cases:
    assert urllib.parse.urlparse(url).hostname in ALLOWED
    request = urllib.request.Request(url, method=method, headers=headers)
    try:
        try:
            response = opener.open(request, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            body = response.read(65536)
            result = {'test': name, 'status': response.status, 'pass': response.status in expected}
            if name == 'query cannot grant role' and response.status == 403:
                result['layer_unverified'] = True
            if name == 'frontend headers':
                result['meta_csp'] = b'Content-Security-Policy' in body
                result['frame_header'] = bool(response.headers.get('X-Frame-Options') or 'frame-ancestors' in response.headers.get('Content-Security-Policy', ''))
            if name == 'unsigned /api/users':
                result['no_store'] = response.headers.get('Cache-Control') == 'no-store'
        consecutive_errors = 0
    except Exception as error:
        result = {'test': name, 'pass': False, 'unverified': type(error).__name__}
        consecutive_errors += 1
    results.append(result)
    print(json.dumps(result, ensure_ascii=False), flush=True)
    if consecutive_errors >= 2:
        break
print(json.dumps({'attempted': len(results), 'passed': sum(r['pass'] for r in results), 'verified': sum(r['pass'] and not r.get('layer_unverified') for r in results), 'planned': len(cases)}))
