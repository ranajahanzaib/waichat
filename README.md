<div align="center">
  
  <img alt="WaiChat Logo" height="128" alt="waichat" src="https://github.com/user-attachments/assets/032b440a-fdd6-421d-a1ff-1c89287e1ee6" />

  <h1>WaiChat</h1>
  
  [![Status: Alpha](https://img.shields.io/badge/Status-Alpha-orange.svg)]()
  [![Build](https://github.com/ranajahanzaib/WaiChat/actions/workflows/ci.yml/badge.svg)](https://github.com/ranajahanzaib/WaiChat/actions/workflows/ci.yml)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
  [![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg)](./CONTRIBUTING.md)
  
</div>

Free, open-source AI chat that runs entirely on Cloudflare's free tier. 1-click deploy. Powered by the latest open-source models via Workers AI.

> _WaiChat is in active development. Core chat is functional, but authentication and UI/UX are still being refined. Use for testing/personal purposes only. Suggest feature/fixes [here](https://github.com/ranajahanzaib/waichat/issues/new) and track progress [here](https://github.com/users/ranajahanzaib/projects/33/views/8)._
>
> _**WaiChat is short for Workers AI Chat**_

<img width="1578" height="1203" alt="WaiChat Screenshot A" src="https://github.com/user-attachments/assets/ec15dc6e-3ca3-42ff-ba9a-5b9a4b1faf53" />

<img width="1572" height="1210" alt="WaiChat Screenshot B" src="https://github.com/user-attachments/assets/5de4f94c-12d6-4b4b-b15f-21d409ed61c6" />

##

https://github.com/user-attachments/assets/e62c3a84-aa5d-4d24-be3f-f162115db89a

## Features

- **One-click deploy** - runs entirely on Cloudflare's free tier
- **Modern interface** - responsive, native-feeling glassmorphic UI with Light, Dark, and System themes
- **Multiple AI models** - switch between available Workers AI models on the fly, with separate default and active model settings, in-chat attribution, and deprecated models automatically excluded
- **Smart streaming** - real-time output with beautifully parsed, collapsible `<think>` blocks for reasoning models, stop generation at any time, and retry or edit-and-regenerate any message
- **Rich message rendering** - enhanced Markdown support with syntax-highlighted, actionable code blocks
- **Flexible workspaces** - instantly toggle between cloud (Cloudflare D1) and local (browser localStorage) environments, with full conversation portability between the two
- **System prompts** - per-workspace system prompt support with optional cloud sync
- **Branching conversations** - navigate and restore previous conversation states via history branching
- **Chat management** - collapsible sidebar, auto-generated titles, deep-linked URLs, per-message deletion, and one-click copy for prompts and responses
- **Export / Import** - back up and restore your entire workspace data
- **Auth-ready** - works out of the box with [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) for zero-trust private deployments

## Deploy

### Recommended: Fork → Deploy to Cloudflare

The best way to self-host WaiChat. Takes about 1 minute, no CLI required, and you get automatic deployments whenever you sync your fork with upstream updates.

**1. Fork this repository**

Click **Fork** at the top of this page. Keep the default settings and confirm.

**2. Connect your fork to Cloudflare**

[**Open Cloudflare Workers & Pages →**](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create)

Select your account if prompted, then **Continue with GitHub** → select your forked repository → **Next** → **Deploy**.

Cloudflare will build and deploy your app automatically. Your app will be live at `https://waichat.<your-subdomain>.workers.dev`.

**3. Updating**

To get the latest WaiChat features and fixes, sync your fork from GitHub:

- Go to your fork on GitHub
- Click **Sync fork** → **Update branch**

Cloudflare detects the push and redeploys automatically within seconds. No manual steps required.

---

### Quick Start: One-Click Deploy

> **Note:** This option gets you running instantly, but your deployment won't receive future updates automatically. Use the Fork method above for long-term self-hosting.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ranajahanzaib/WaiChat/tree/v0.1.5-alpha.2)

Cloudflare handles everything - provisions a D1 database and Workers AI binding, builds, and deploys to `https://waichat.<your-subdomain>.workers.dev`.

---

### Manual (CLI)

Requires a [Cloudflare account](https://dash.cloudflare.com/sign-up) and [Wrangler](https://developers.cloudflare.com/workers/wrangler/).

```bash
git clone https://github.com/ranajahanzaib/waichat.git
cd waichat
pnpm install

# 1. Create your D1 database
npx wrangler d1 create waichat-db

# 2. Set up your local wrangler config
cp wrangler.local.jsonc.example wrangler.local.jsonc
# Open wrangler.local.jsonc and paste your new database_id inside

# 3. Migrate and deploy
pnpm db:migrate:remote
pnpm deploy:production
```

---

## Auth (Optional)

WaiChat does not include built-in authentication. For private deployments, use [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) to gate your app behind a login - supports Google, GitHub, and one-time email PIN out of the box, for free (up to 50 users).

See [docs/self-hosting.md](./docs/self-hosting.md) for a step-by-step setup guide.

---

## Storage

| Mode      | How it works                                                                    |
| --------- | ------------------------------------------------------------------------------- |
| **Cloud** | Chat history stored in Cloudflare D1 (SQLite). Default.                         |
| **Local** | Chat history stored in your browser's localStorage. No data leaves your device. |

Toggle between modes in the app settings.

---

## Tech Stack

- **Frontend** - React + Vite
- **Backend** - Cloudflare Worker + [Hono](https://hono.dev/)
- **AI** - Cloudflare Workers AI (direct binding)
- **Database** - Cloudflare D1
- **Auth** - Cloudflare Access

---

## Free Tier Limits

Everything WaiChat uses fits within Cloudflare's free tier:

| Service               | Free allowance                           |
| --------------------- | ---------------------------------------- |
| Workers AI            | 10,000 neurons/day                       |
| Workers               | 100,000 requests/day                     |
| D1                    | 5M reads · 100K writes/day · 5GB storage |
| Pages/Workers hosting | Unlimited                                |

For personal use, you'll never come close to these limits.

---

## Contributing

We'd love to accept your patches and contributions to this project. There are just a few guidelines you need to follow.

### [Code of Conduct](./CODE_OF_CONDUCT.md)

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/) as its Code of Conduct, and we expect all project participants to adhere to it. Kindly read the [full guide](./CODE_OF_CONDUCT.md) to understand what actions will not be tolerated.

### [Contributing Guide](./CONTRIBUTING.md)

Read our [contributing guide](./CONTRIBUTING.md) to learn about our development process, how to propose bug fixes and improvements, and how to build and test your changes to the project.

### Issues & Roadmap

We build in public! All active development, upcoming features, and known bugs are tracked on our **[WaiChat Public Roadmap](https://github.com/users/ranajahanzaib/projects/33)**.

Feel free to submit issues and enhancement requests. Use the template provided when creating an issue to ensure your request is clear and actionable. If you are looking for something to work on, check out the **Bug Tracker** or **To Do** columns on the project board.

## [License](./LICENSE)

This project is licensed under the [MIT License](./LICENSE), meaning that you're free to modify, distribute, and/or use it for any commercial or private project.
