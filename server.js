require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// ── SECURITY ─────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'https://adzo-dashboard.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ── RATE LIMITING ─────────────────────────────────
const limiter     = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many attempts' } });
const aiLimiter   = rateLimit({ windowMs: 60 * 1000, max: 15, message: { error: 'AI rate limit' } });

app.use(limiter);
app.use(express.json({ limit: '2mb' }));

// ── HEALTH CHECK ──────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
});

// ── ROUTES ────────────────────────────────────────
app.use('/api/auth',      authLimiter, require('./auth'));
app.use('/api/leads',                  require('./leads'));
app.use('/api/content',  aiLimiter,   require('./content'));
app.use('/api/campaigns',              require('./campaigns'));
app.use('/api/wallet',                 require('./wallet'));
app.use('/api/admin',                  require('./admin'));

// ── WEBHOOK: Lead from ad click ───────────────────
app.post('/webhook/lead', async (req, res) => {
  const supabase = require('./supabase');
  const { business_id, name, phone, email, source, locality, budget } = req.body;
  if (!business_id || !phone) return res.status(400).json({ error: 'Missing required fields' });
  try {
    const { data, error } = await supabase.from('leads').insert({
      business_id, name, phone, email, source: source || 'webhook',
      locality, budget, status: 'new'
    }).select().single();
    if (error) throw error;
    res.status(201).json({ lead: data });
  } catch (err) {
    res.status(500).json({ error: 'Webhook failed' });
  }
});

// ── 404 ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── ERROR HANDLER ─────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── START ─────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Adzo API running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
});
