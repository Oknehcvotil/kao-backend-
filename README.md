# KAO Delivery — Backend

Node.js/Express API for the KAO Delivery website quote form.

## What it does

`POST /api/quote`:

1. validates and sanitizes form data;
2. sends the request to **office@kao.delivery** through SMTP;
3. sends the same request to a Telegram bot/chat;
4. rate-limits submissions and includes a honeypot field for basic spam protection.

Health check:

```
GET /api/health
```

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

### Required environment variables

For email:

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=KAO Delivery Website <no-reply@kao.delivery>
QUOTE_TO=office@kao.delivery
```

For Telegram:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Frontend origins:

```env
CORS_ORIGIN=https://kao.delivery,https://www.kao.delivery
```

## Telegram setup

1. Create a bot via **@BotFather** and copy the bot token.
2. Add the bot to the target group/chat.
3. Send a message in that chat.
4. Get the chat ID using Telegram Bot API `getUpdates` (or a trusted chat-ID helper).
5. Put the token and chat ID into the deployment environment. Never commit them to GitHub.

## Deployment

The service works on Railway/Render/Fly.io or any Node 18+ host.

Start command:

```bash
npm start
```

After deployment, set the frontend variable `VITE_API_URL` to the backend public URL and rebuild the frontend.
