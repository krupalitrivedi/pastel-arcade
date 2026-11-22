# Pixel Party

A pastel two-player arcade that works **without the internet**. Each browser runs an
[Offline Protocol](https://github.com/Offline-Protocol/offline-protocol-sdk) node: players
find each other nearby, swap names and colors, send challenges, and play over an
end-to-end encrypted connection. No server is involved.

## Games
- **Memory Match**: turn-based on one shared board (moves sent reliably).
- **Paddle Duel**: real time; the host runs the ball and streams it about 20 times a second as
  "ephemeral" messages, and the guest sends its paddle position.

## How players find each other
- **Same browser, different tabs**: automatic. Use "open a 2nd player tab" (each tab is its own
  player through `?profile=`).
- **Two devices on the same Wi-Fi / hotspot**: "connect another device" → one makes a code, the
  other answers it (WebRTC, no internet needed).

## Works with no internet
Live at **https://pixel-party-eight.vercel.app**. Open it **once while online** and it saves itself on
the device (a service worker, `sw.js`, caches every file: page, games, the engine and the fonts).
After that it opens and plays with no internet at all, and it can be added to the home screen like an app.
The page shows "✦ saved on this device · works offline" once that is done.

When a new version is deployed, visitors see "new version ready · tap to update"; it never
replaces the site in the middle of a game.

> **When you change any file, bump `VERSION` at the top of `sw.js`**, or visitors keep the old version.

## Running it
The page must be served over **https** or from **localhost**, because the engine needs a secure context.
No build step: it's plain HTML, CSS and JavaScript plus the prebuilt engine in `vendor/`.

**On one computer** (two tabs = two players):

```
python tools/serve.py 5180
```

Then open http://localhost:5180 and use "open a 2nd player tab".

**Host a party for phones: one scan, no internet** (same Wi-Fi router, or the computer's hotspot):

```
python tools/serve.py --https
```

1. On the computer, open **http://localhost:5180** and go online. The lobby shows **"phones join here"**
   with one QR code.
2. Each phone scans it with its **camera app**. Pixel Party opens from the computer, the player picks a
   name, and they're connected. Nobody scans anything back, and more phones can scan the same code.

How it works: a WebRTC connection needs a code from *both* sides, so `serve.py` includes a tiny relay
(`/signal/`) that hands the phone's code to the host and the host's answer back. It only passes those
two codes; the game itself then runs device to device, end-to-end encrypted.

The first time, each phone warns that the certificate isn't trusted (it's self-made): choose
*Advanced → Proceed*. The certificate is reused afterwards (it needs `openssl`, which comes with Git for
Windows). It lives in `tools/certs/`, which is git-ignored. Never commit it.

Any static host with https (GitHub Pages, Netlify…) also works.

## Files
- `index.html`, `style.css`, `app.js`: lobby, challenges, game screen
- `net.js`: small wrapper around the Offline Protocol node
- `sw.js`, `manifest.webmanifest`: offline caching and "install as app"
- `games/`: Memory Match and Paddle Duel
- `vendor/offline-protocol/`: the Offline Protocol web bindings (`src/`) and the WebAssembly
  engine built from the SDK source (`pkg/`)

## License
`vendor/offline-protocol/` is from the Offline Protocol SDK and is licensed **AGPL-3.0-only**
(commercial licences are available from Offline Protocol, Inc.). Because Pixel Party ships it, if you
share Pixel Party publicly you must also make its full source available under the AGPL.
