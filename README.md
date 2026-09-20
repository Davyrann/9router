<div align="center">

# 9Router

### Serenhope Fork

<img src="images/fusion-combo-ui.png" alt="9Router" width="100%" />

A fork of [Decolua/9router](https://github.com/Decolua/9router), edited for my own use.

One gateway, one API key, any model: an OpenAI-compatible endpoint that routes to Claude, Gemini, Kimi, Qwen, GLM and more, with OAuth or your own accounts. This is still that router. I just changed the parts I use daily and fixed what annoyed me.

![License](https://img.shields.io/badge/license-MIT-green) ![Upstream](https://img.shields.io/badge/upstream-Decolua%2F9router-blue) ![Release](https://img.shields.io/badge/releases-v0.5.x--Custom-orange)

</div>

---

## Screenshots

<div align="center">

<img src="images/9router.png" alt="9Router dashboard" width="100%" />

</div>

## About this fork

Upstream 9Router does the heavy lifting: it translates one OpenAI-style request into dozens of provider formats and streams the answer back. All of that works here too.

On top of it, this fork ships its own releases (marked `-Custom`, see [CHANGELOG.md](./CHANGELOG.md)), adds a handful of dashboard features, and removes what I never used. Everything I changed is written down in the changelog, grouped under *Contributed by Serenhope*, so it is easy to tell my edits from upstream's work.

If you want the original instead, head to the [upstream repository](https://github.com/Decolua/9router) and [9router.com](https://9router.com).

## Getting started

```bash
git clone https://github.com/serenhope/9router.git
cd 9router
npm install
npm run dev          # dashboard on http://localhost:20127
```

Production:

```bash
npm run build
npm run start
```

Docker:

```bash
docker build -t 9router-fork .
docker run -d -p 20128:20128 -v 9router-data:/app/data 9router-fork
```

Once it is running:

| | |
| --- | --- |
| Dashboard | `http://localhost:20127/dashboard` (first login: `seren123`, or set `INITIAL_PASSWORD`) |
| OpenAI-compatible | `http://localhost:20127/v1` |
| Claude-compatible | `http://localhost:20127/v1/messages` |
| Gemini-native | `http://localhost:20127/v1beta/models/{model}:generateContent` |

Point any CLI tool or agent at the base URL, generate a key under **Endpoint & Key**, and you are done.

## Configuration

The app reads a few environment variables with sensible defaults; see [.env.example](./.env.example). State lives in `~/.9router` (SQLite database, backups, secrets). Download Backup / Import Backup in the settings page moves everything at once.

## Credits

- Built on **[Decolua/9router](https://github.com/Decolua/9router)** — full credit to upstream for the router, the providers and the translators.
- Fork releases are tagged in [CHANGELOG.md](./CHANGELOG.md).
- License: **MIT**, same as upstream. See [LICENSE](./LICENSE).

---

<div align="center">

If this fork helped you, a star is appreciated.

[![Stars](https://img.shields.io/github/stars/serenhope/9router?style=social)](https://github.com/serenhope/9router/stargazers)

</div>
