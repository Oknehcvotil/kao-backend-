import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const app = express();
const port = Number(process.env.PORT || 5000);

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '64kb' }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
  }),
);

const quoteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Please try again later.' },
});

const clean = (value, max = 1000) =>
  String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const escapeHtml = (value) =>
  clean(value, 4000)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isPhone = (value) => /^[+()\d\s.-]{7,30}$/.test(value);

function normalizeQuote(body) {
  return {
    name: clean(body.name, 100),
    phone: clean(body.phone, 40),
    email: clean(body.email, 160).toLowerCase(),
    details: clean(body.details, 1800),
    replyVia: ['phone', 'email', 'messenger'].includes(body.replyVia) ? body.replyVia : 'phone',
    language: body.language === 'en' ? 'en' : 'uk',
    website: clean(body.website, 120),
  };
}

function validateQuote(quote) {
  if (quote.website) return { spam: true };
  if (quote.name.length < 2) return { error: 'Name is required.' };
  if (!isPhone(quote.phone)) return { error: 'Valid phone is required.' };
  if (!isEmail(quote.email)) return { error: 'Valid email is required.' };
  return {};
}

async function sendTelegram(quote) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error('Telegram delivery is not configured.');
  }

  const replyVia = {
    phone: 'Телефон',
    email: 'Email',
    messenger: 'Месенджер',
  };

  // Telegram plain text avoids HTML entity parsing failures in client-entered data.
  const message = [
    '🚢 KAO DELIVERY — нова заявка із сайту',
    '',
    `👤 Ім’я: ${quote.name}`,
    `📞 Телефон: ${quote.phone}`,
    `✉️ Email: ${quote.email}`,
    `💬 Зв’язатися через: ${replyVia[quote.replyVia]}`,
    `🌐 Мова сайту: ${quote.language.toUpperCase()}`,
    '',
    'Деталі перевезення:',
    quote.details || 'Не вказано',
  ].join('\n');

  const sendToChat = async (destination) => {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: destination,
        text: message,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const result = await response.json().catch(() => null);
    return { response, result };
  };

  let { response, result } = await sendToChat(chatId);

  // Telegram can migrate normal groups to supergroups, giving them a new ID.
  // Retry once against the new ID returned by Telegram, without requiring
  // a manual Vercel environment update.
  const migratedChatId = result?.parameters?.migrate_to_chat_id;
  if (!result?.ok && migratedChatId && String(migratedChatId) !== String(chatId)) {
    console.info('KAO Telegram group migrated to a supergroup; retrying with new chat ID.');
    ({ response, result } = await sendToChat(migratedChatId));
  }

  if (!response.ok || !result?.ok) {
    const description = typeof result?.description === 'string'
      ? result.description.slice(0, 250)
      : 'Unspecified Telegram error';
    throw new Error(`Telegram API HTTP ${response.status}: ${description}`);
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'kao-delivery-backend',
    time: new Date().toISOString(),
  });
});

app.post('/api/quote', quoteLimiter, async (req, res) => {
  const quote = normalizeQuote(req.body || {});
  const validation = validateQuote(quote);

  // Silently accept honeypot submissions so bots do not learn the protection.
  if (validation.spam) return res.status(200).json({ ok: true });
  if (validation.error) return res.status(400).json({ ok: false, error: validation.error });

  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.error('KAO Telegram delivery is not configured.');
    return res.status(503).json({ ok: false, error: 'Telegram delivery is not configured.' });
  }

  try {
    await sendTelegram(quote);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('KAO Telegram delivery failed:', error?.message || error);
    return res.status(502).json({ ok: false, error: 'Could not deliver the request.' });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err?.message === 'Origin is not allowed by CORS') {
    return res.status(403).json({ ok: false, error: 'Origin is not allowed.' });
  }
  return res.status(500).json({ ok: false, error: 'Internal server error.' });
});

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`KAO Delivery backend listening on port ${port}`);
  });
}

export default app;
