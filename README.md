# KAO Delivery — Telegram-only backend

Express API for the quote form at https://kao.delivery. Mail/SMTP is not used.

## Endpoints

- `GET /api/health` — health check
- `POST /api/quote` — validates a quote and sends the details to a Telegram chat through the Bot API

The API responds with success only if Telegram confirms delivery to the chat.
If credentials are missing it returns HTTP 503; if Telegram fails it returns HTTP 502.
Includes basic rate limiting and a honeypot field. Rate limiting is in-memory per serverless instance and does not guarantee global limits.

## Telegram setup

1. Open the verified `@BotFather` account in Telegram, run `/newbot` and create a new bot.
2. Choose the destination: private chat with the bot (send the bot `/start`) or a company group (add the bot and post a message). A bot cannot message a user who has not started it.
3. Determine the numeric chat ID using the Bot API `getUpdates` after sending a message to the bot, or use a trusted method. For a group, the ID is usually negative. Keep your token secret.
4. Go to the Vercel project `kao-backend`, Settings → Environment Variables, and add in **Production**:
   - `TELEGRAM_BOT_TOKEN` (Secret) — value from BotFather
   - `TELEGRAM_CHAT_ID` (Secret or Config) — destination chat ID
5. Redeploy production after saving the variables, then submit a test form and verify the notification in the chat.

## Vercel production

- Project: `kao-backend`
- API: `https://kao-backend.vercel.app`
- Serverless entrypoint: `api/index.js`
- Allowed origins: `https://kao.delivery`, `https://www.kao.delivery`

Existing `CORS_ORIGIN` can stay. `QUOTE_TO` and SMTP variables are unused and may be removed.

For local development:

```bash
npm install
cp .env.example .env
npm run dev
```

## Frontend deployment

React form in `Oknehcvotil/kao` points to `https://kao-backend.vercel.app/api/quote`.
The public `kao.delivery` website is on FTP hosting, so publish the new `dist` build there.
Deploying backend or updating GitHub alone does not update the FTP-hosted website.
