"""Local server for Pixel Party (no-store caching, correct .wasm type).

  python tools/serve.py                 -> http://localhost:5180 (this computer only)
  python tools/serve.py --https         -> host a party for phones on your Wi-Fi, no internet needed:
                                           this computer:  http://localhost:5180
                                           phones/tablets: https://<this-computer's-Wi-Fi-IP>:5443
  Options: first number = port (5180, or the https port with --https), --local-port N (default 5180)

--https makes a self-signed certificate in tools/certs (needs `openssl`, which comes
with Git for Windows). Each phone shows a "not private" warning the first time:
choose Advanced -> Proceed. The certificate and key are git-ignored; never commit them.

One-scan joining: the host's lobby shows a QR code. A phone scans it with its camera
app, opens Pixel Party from this computer, and the two pages swap their connection
codes through /signal/ below, so nobody has to scan anything back. /signal/ only
passes those codes along (they are useless without the WebRTC connection they set
up); all game traffic then goes device to device, end-to-end encrypted.
"""
import functools
import http.server
import json
import os
import re
import secrets
import shutil
import socket
import ssl
import subprocess
import sys
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGV = sys.argv[1:]
HTTPS = '--https' in ARGV


def opt(name, default):
    if name in ARGV:
        i = ARGV.index(name)
        if i + 1 < len(ARGV):
            return int(ARGV[i + 1])
    return default


NUMS = [a for i, a in enumerate(ARGV) if a.isdigit() and (i == 0 or ARGV[i - 1] != '--local-port')]
PORT = int(NUMS[0]) if NUMS else (5443 if HTTPS else 5180)   # https port with --https
LOCAL_PORT = opt('--local-port', 5180)

# ---------------- join relay (in memory) ----------------
ID = re.compile(r'^[A-Za-z0-9_-]{8,40}$')
MAX_BODY = 64 * 1024
ROOM_TTL = 3 * 60 * 60      # a party stays joinable for 3 hours
TICKET_TTL = 5 * 60         # a join attempt gets 5 minutes to finish
LOCK = threading.Lock()
ROOMS = {}                  # room -> {'t': opened, 'tickets': {ticket: {'offer', 'answer', 't'}}}
INFO = {'https': HTTPS, 'httpsPort': PORT if HTTPS else None, 'ips': []}


def prune():
    now = time.time()
    for room in [r for r, v in ROOMS.items() if now - v['t'] > ROOM_TTL]:
        del ROOMS[room]
    for v in ROOMS.values():
        for t in [t for t, x in v['tickets'].items() if now - x['t'] > TICKET_TTL]:
            del v['tickets'][t]


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.wasm': 'application/wasm', '.js': 'text/javascript', '.mjs': 'text/javascript',
                      '.webmanifest': 'application/manifest+json'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):  # keep the console readable: hide relay polling
        if '/signal/' not in (self.path or ''):
            super().log_message(fmt, *args)

    def reply(self, code, body=None, ctype='application/json'):
        data = b'' if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
        self.send_response(code)
        if data:
            self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        if data:
            self.wfile.write(data)

    def parts(self):
        path = self.path.split('?')[0]
        if not path.startswith('/signal/'):
            return None
        return [p for p in path[len('/signal/'):].split('/') if p]

    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0 or n > MAX_BODY:
            return None
        return self.rfile.read(n).decode('utf-8', 'replace')

    def do_GET(self):
        p = self.parts()
        if p is None:
            return super().do_GET()
        with LOCK:
            prune()
            if p == ['info']:
                return self.reply(200, INFO)
            if len(p) == 2 and p[1] == 'pending' and ID.match(p[0]):
                room = ROOMS.get(p[0])
                if not room:
                    return self.reply(404, {'error': 'party not open'})
                return self.reply(200, [{'ticket': t, 'offer': x['offer']}
                                        for t, x in room['tickets'].items() if x['answer'] is None])
            if len(p) == 3 and p[2] == 'answer' and ID.match(p[0]) and ID.match(p[1]):
                x = ROOMS.get(p[0], {}).get('tickets', {}).get(p[1])
                if not x:
                    return self.reply(404, {'error': 'unknown join'})
                return self.reply(200, x['answer'].encode(), 'text/plain') if x['answer'] else self.reply(204)
        return self.reply(404, {'error': 'not found'})

    def do_POST(self):
        p = self.parts()
        if p is None:
            return self.reply(405)
        text = self.body() if not (len(p) == 2 and p[1] == 'open') else ''
        with LOCK:
            prune()
            if len(p) == 2 and p[1] == 'open' and ID.match(p[0]):
                if len(ROOMS) >= 50 and p[0] not in ROOMS:
                    return self.reply(429, {'error': 'too many parties'})
                ROOMS.setdefault(p[0], {'t': time.time(), 'tickets': {}})['t'] = time.time()
                return self.reply(204)
            if len(p) == 2 and p[1] == 'join' and ID.match(p[0]):
                room = ROOMS.get(p[0])
                if not room:
                    return self.reply(404, {'error': 'party not open'})
                if not text or len(room['tickets']) >= 100:
                    return self.reply(400, {'error': 'bad request'})
                ticket = secrets.token_urlsafe(12)
                room['tickets'][ticket] = {'offer': text, 'answer': None, 't': time.time()}
                return self.reply(201, {'ticket': ticket})
            if len(p) == 3 and p[2] == 'answer' and ID.match(p[0]) and ID.match(p[1]):
                x = ROOMS.get(p[0], {}).get('tickets', {}).get(p[1])
                if not x or not text:
                    return self.reply(404, {'error': 'unknown join'})
                x['answer'] = text
                return self.reply(204)
        return self.reply(404, {'error': 'not found'})


def lan_ips():
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))  # no packet is sent; just picks the LAN interface
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith('127.'))


def find_openssl():
    found = shutil.which('openssl')
    if found:
        return found
    for base in (os.environ.get('ProgramFiles', r'C:\Program Files'), os.environ.get('ProgramFiles(x86)', '')):
        for sub in (r'Git\usr\bin\openssl.exe', r'Git\mingw64\bin\openssl.exe'):
            p = os.path.join(base, sub)
            if base and os.path.exists(p):
                return p
    return None


def make_cert(ips):
    """Reuse the certificate while it still covers this computer's Wi-Fi addresses, so phones
    only have to accept it once; otherwise make a new one (needs openssl, bundled with Git)."""
    d = os.path.join(ROOT, 'tools', 'certs')
    os.makedirs(d, exist_ok=True)
    cert, key, stamp = (os.path.join(d, n) for n in ('cert.pem', 'key.pem', 'ips.txt'))
    want = ','.join(ips)
    fresh = os.path.exists(cert) and time.time() - os.path.getmtime(cert) < 300 * 24 * 3600
    if fresh and os.path.exists(key) and os.path.exists(stamp) and open(stamp).read() == want:
        return cert, key
    openssl = find_openssl()
    if not openssl:
        sys.exit('openssl not found: install Git for Windows (it includes openssl), or add openssl to PATH.')
    san = ','.join(['DNS:localhost', 'IP:127.0.0.1'] + [f'IP:{ip}' for ip in ips])
    subprocess.run([openssl, 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365',
                    '-keyout', key, '-out', cert, '-subj', '/CN=Pixel Party (local)',
                    '-addext', f'subjectAltName={san}'], check=True, capture_output=True)
    with open(stamp, 'w') as f:
        f.write(want)
    return cert, key


handler = functools.partial(Handler, directory=ROOT)
if HTTPS:
    ips = lan_ips()
    INFO['ips'] = ips
    cert, key = make_cert(ips)
    lan = http.server.ThreadingHTTPServer(('0.0.0.0', PORT), handler)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(cert, key)
    lan.socket = ctx.wrap_socket(lan.socket, server_side=True)
    local = http.server.ThreadingHTTPServer(('127.0.0.1', LOCAL_PORT), handler)
    threading.Thread(target=lan.serve_forever, daemon=True).start()
    print('Pixel Party party host is running (no internet needed).', flush=True)
    print(f'  On THIS computer open:  http://localhost:{LOCAL_PORT}', flush=True)
    print('  Phones: scan the QR code shown in the lobby, or open', flush=True)
    for ip in ips or ['<this-computer-ip>']:
        print(f'          https://{ip}:{PORT}', flush=True)
    local.serve_forever()
else:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler)
    print(f'Pixel Party: http://localhost:{PORT}', flush=True)
    server.serve_forever()
