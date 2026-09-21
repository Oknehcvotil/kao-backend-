import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';

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
  if (quote.details.length < 5) return { error: 'Shipment details are required.' };
  return {};
}

function createMailTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

async function sendEmail(quote) {
  const transport = createMailTransport();
  if (!transport) return { skipped: true, reason: 'SMTP is not configured' };

  const replyLabels = {
    phone: 'Телефон / Phone',
    email: 'Email',
    messenger: 'Месенджер / Messenger',
  };

  const subject = `KAO Delivery — новий запит від ${quote.name}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#071827">
      <div style="background:#071827;color:#fff;padding:24px 28px">
        <strong style="font-size:20px">KAO DELIVERY</strong>
        <div style="opacity:.7;margin-top:6px">Новий запит із сайту</div>
      </div>
      <div style="padding:28px;border:1px solid #e2e6e8;border-top:0">
        <p><strong>Ім’я:</strong> ${escapeHtml(quote.name)}</p>
        <p><strong>Телефон:</strong> ${escapeHtml(quote.phone)}</p>
        <p><strong>Email:</strong> ${escapeHtml(quote.email)}</p>
        <p><strong>Бажаний канал:</strong> ${replyLabels[quote.replyVia]}</p>
        <p><strong>Мова сайту:</strong> ${quote.language.toUpperCase()}</p>
        <p style="margin-top:24px"><strong>Деталі:</strong></p>
        <div style="white-space:pre-wrap;line-height:1.6;background:#f5f6f6;padding:18px">${escapeHtml(quote.details)}</div>
      </div>
    </div>
  `;

  const info = await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.QUOTE_TO || 'office@kao.delivery',
    replyTo: quote.email,
    subject,
    text: [
      'KAO Delivery — new website quote',
      `Name: ${quote.name}`,
      `Phone: ${quote.phone}`,
      `Email: ${quote.email}`,
      `Reply via: ${replyLabels[quote.replyVia]}`,
      `Language: ${quote.language.toUpperCase()}`,
      '',
      quote.details,
    ].join('\n'),
    html,
  });

  return { sent: true, messageId: info.messageId };
}

async function sendTelegram(quote) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) return { skipped: true, reason: 'Telegram is not configured' };

  const replyLabels = {
    phone: 'Телефон',
    email: 'Email',
    messenger: 'Месенджер',
  };

  const message = [
    '🚢 <b>KAO Delivery — новий запит</b>',
    '',
    `👤 <b>Ім’я:</b> ${escapeHtml(quote.name)}`,
    `📞 <b>Телефон:</b> ${escapeHtml(quote.phone)}`,
    `✉️ <b>Email:</b> ${escapeHtml(quote.email)}`,
    `💬 <b>Відповідь:</b> ${replyLabels[quote.replyVia]}`,
    `🌐 <b>Мова:</b> ${quote.language.toUpperCase()}`,
    '',
    '<b>Деталі перевезення:</b>',
    escapeHtml(quote.details),
  ].join('\n');

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram error ${response.status}: ${body.slice(0, 250)}`);
  }

  return { sent: true };
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'kao-delivery-backend',
    time: new Date().toISOString(),
  });
});

app.post('/api/quote', quoteLimiter, async (req, res) => {
  const quote = normalizeQuote(req.body);
  const validation = validateQuote(quote);

  // Silently accept honeypot submissions so bots do not learn the protection.
  if (validation.spam) return res.status(200).json({ ok: true });
  if (validation.error) return res.status(400).json({ ok: false, error: validation.error });

  const settled = await Promise.allSettled([sendEmail(quote), sendTelegram(quote)]);
  const channels = settled.map((result, index) => {
    const name = index === 0 ? 'email' : 'telegram';
    if (result.status === 'fulfilled') return { name, ...result.value };
    return { name, error: result.reason?.message || 'Unknown delivery error' };
  });

  const delivered = channels.some((channel) => channel.sent);
  const configured = channels.some((channel) => !channel.skipped);

  if (!configured) {
    console.error('Quote received, but no delivery channel is configured.');
    return res.status(503).json({
      ok: false,
      error: 'Form delivery is not configured on the server.',
    });
  }

  if (!delivered) {
    console.error('Quote delivery failed:', channels);
    return res.status(502).json({
      ok: false,
      error: 'Could not deliver the request.',
    });
  }

  const failedChannel = channels.find((channel) => channel.error);
  if (failedChannel) console.error('One quote delivery channel failed:', channels);

  return res.status(200).json({
    ok: true,
    channels: channels.map(({ name, sent, skipped }) => ({ name, sent: Boolean(sent), skipped: Boolean(skipped) })),
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err?.message === 'Origin is not allowed by CORS') {
    return res.status(403).json({ ok: false, error: 'Origin is not allowed.' });
  }
  return res.status(500).json({ ok: false, error: 'Internal server error.' });
});

app.listen(port, () => {
  console.log(`KAO Delivery backend listening on port ${port}`);
});
