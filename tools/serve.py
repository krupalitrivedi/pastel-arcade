"""Local server for Pixel Party (no-store caching, correct .wasm type).

  python tools/serve.py 5180            -> http://localhost:5180 (this computer only)
  python tools/serve.py 5443 --https    -> https://<this-computer's-Wi-Fi-IP>:5443 for phones/tablets

--https makes a self-signed certificate in tools/certs (needs `openssl`, which comes
with Git for Windows) and listens on your local network. Each device shows a
"not private" warning the first time: choose Advanced -> Proceed. No internet is needed.
"""
import functools
import http.server
import os
import socket
import ssl
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
HTTPS = '--https' in sys.argv
PORT = int(ARGS[0]) if ARGS else (5443 if HTTPS else 5180)


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.wasm': 'application/wasm', '.js': 'text/javascript', '.mjs': 'text/javascript'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


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


def make_cert(ips):
    d = os.path.join(ROOT, 'tools', 'certs')
    os.makedirs(d, exist_ok=True)
    cert, key = os.path.join(d, 'cert.pem'), os.path.join(d, 'key.pem')
    san = ','.join(['DNS:localhost', 'IP:127.0.0.1'] + [f'IP:{ip}' for ip in ips])
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365',
                    '-keyout', key, '-out', cert, '-subj', '/CN=Pixel Party (local)',
                    '-addext', f'subjectAltName={san}'], check=True, capture_output=True)
    return cert, key


handler = functools.partial(Handler, directory=ROOT)
if HTTPS:
    ips = lan_ips()
    cert, key = make_cert(ips)
    server = http.server.ThreadingHTTPServer(('0.0.0.0', PORT), handler)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(cert, key)
    server.socket = ctx.wrap_socket(server.socket, server_side=True)
    print('Pixel Party is on your local network. Open on each device (same Wi-Fi):', flush=True)
    for ip in ips or ['<this-computer-ip>']:
        print(f'  https://{ip}:{PORT}', flush=True)
    print(f'  https://localhost:{PORT}  (this computer)', flush=True)
else:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler)
    print(f'Pixel Party: http://localhost:{PORT}', flush=True)
server.serve_forever()
