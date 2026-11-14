# KAO Delivery — email-only backend

Express API for the quote form at https://kao.delivery.

## Endpoints

- `GET /api/health` — health check
- `POST /api/quote` — validates a quote and sends it by SMTP to `office@kao.delivery`

Telegram is disabled. The form only responds with success after the SMTP provider accepts the message. Includes basic rate limiting and a honeypot.

## Vercel production

- Project: `kao-backend`
- API origin: `https://kao-backend.vercel.app`
- Function route: `/api/quote`
- Serverless entrypoint: `api/index.js`
- Frontend allowed origins: `https://kao.delivery`, `https://www.kao.delivery`

### Required Vercel environment variables

Set the following in Project Settings -> Environment Variables, under Production (and Preview only if needed):

```env
SMTP_HOST=your-provider-smtp-host
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-sending-mailbox
SMTP_PASS=your-provider-secret
SMTP_FROM=KAO Delivery <your-sending-mailbox>
QUOTE_TO=office@kao.delivery
CORS_ORIGIN=https://kao.delivery,https://www.kao.delivery
```

Use the SMTP provider's real credentials and a sender address it authorizes. Keep `SMTP_PASS` as a Secret in Vercel; never commit credentials. After adding credentials, redeploy production and test an actual form submission and recipient inbox. The server returns HTTP 503 until SMTP is configured.

For local development:

```bash
npm install
cp .env.example .env
npm run dev
```

## Frontend delivery

The React form in `Oknehcvotil/kao` defaults to the Vercel API URL. The live `kao.delivery` site is hosted separately via FTP; after updating the frontend source, build it and upload the new `dist` contents to the existing website host. Pushing GitHub or deploying the backend does not update the FTP-hosted frontend automatically.
