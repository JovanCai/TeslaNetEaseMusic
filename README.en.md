# TeslaNetEaseMusic

[简体中文](README.md) · **English** · [日本語](README.ja.md)

> An online music player built for Tesla owners who can't use NetEase Cloud Music while abroad.

Self-hosted. Log in with your own account and listen — with scrolling lyrics — right in the car's browser.

**Features**
- Daily recommendations / your playlists / search / Personal FM (an endless personalized radio)
- Play / pause / previous / next / shuffle / repeat / seek / volume
- Karaoke-style scrolling lyrics; instrumental tracks show “纯音乐 · 请欣赏” (instrumental, enjoy)
- Big buttons, dark high-contrast UI for the car; remembers your last song and volume

## Screens

| Home · Personal FM | Now Playing · Lyrics | Your Playlists |
|---|---|---|
| ![Home](docs/screenshots/home.png) | ![Now Playing](docs/screenshots/player.png) | ![Playlists](docs/screenshots/playlists.png) |

---

## Getting it running

Pick one based on what you have. Full steps are in [DEPLOY.md](DEPLOY.md).

| Your situation | Use | Notes |
|---|---|---|
| A **Mac / computer**, just trying it | [Mac one-liner](DEPLOY.md#mac) | Fastest; open on the car in minutes. The computer must stay on while driving. |
| A **Synology NAS** | [NAS deploy](DEPLOY.md#nas) | Always on, fixed address; **no public IP needed**. |
| A **VPS / cloud server** | [VPS deploy](DEPLOY.md#vps) | Stable, fixed address. |

Quickest try (on a Mac with Docker):

```bash
git clone https://github.com/JovanCai/TeslaNetEaseMusic.git
cd TeslaNetEaseMusic
./deploy.sh
```

The script starts the service, has you scan a QR to log in with your phone, then prints a `https://…` URL. Open that URL in the **Tesla's browser** and you're listening.

---

## FAQ

- **Re-login / switch account**: run `./relogin.sh`, then scan again.
- **Update to a new version**: `git pull`, then `./deploy.sh` again (login is kept).
- **Port 80 in use**: set `APP_PORT=8080` (or another free port) in `.env`.
- **Play region-locked / gray songs abroad** (both off by default — your call; redeploy after changing):
  - Licensed songs that gray out overseas: set `REGION_UNLOCK=true` in `.env` (the backend auto-uses a random China IP; relies on your own account's rights).
  - Unlicensed gray songs: set `ENABLE_UNBLOCK=true` in `.env` (substitutes a same-title track from QQ/Kugou/etc.). Matches can be the wrong version and vary in quality.

---

## Privacy & copyright

- Everyone runs their own copy and logs in with their own NetEase account.
- The login cookie lives only in a volume on your own server — never in the car's browser.
- Playback relies on your own account's rights; region unlock is off by default and up to you.

## License

[AGPL-3.0](LICENSE). Design and implementation docs are in `docs/`.
