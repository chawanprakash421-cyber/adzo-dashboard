const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const supabase = require('../db/supabase');

// Admin auth middleware
function adminOnly(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Unauthorised' });
  try {
    const user = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

router.use(adminOnly);

// GET /api/admin/overview
router.get('/overview', async (req, res) => {
  const [bizRes, leadsRes, txRes] = await Promise.all([
    supabase.from('businesses').select('id, status', { count: 'exact' }),
    supabase.from('leads').select('id', { count: 'exact' }),
    supabase.from('transactions').select('amount').eq('status', 'success')
  ]);

  const revenue = (txRes.data || []).reduce((s, t) => s + (t.amount || 0), 0);
  const byStatus = (bizRes.data || []).reduce((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {});

  res.json({
    total_businesses: bizRes.count || 0,
    total_leads:      leadsRes.count || 0,
    total_revenue_inr: revenue / 100,
    businesses_by_status: byStatus
  });
});

// GET /api/admin/businesses
router.get('/businesses', async (req, res) => {
  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, phone, status, plan, created_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// PATCH /api/admin/businesses/:id
router.patch('/businesses/:id', async (req, res) => {
  const { status, plan } = req.body;
  const { data, error } = await supabase
    .from('businesses').update({ status, plan, updated_at: new Date().toISOString() })
    .eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/admin/system
router.get('/system', (req, res) => {
  res.json({
    status: 'ok',
    node_version: process.version,
    uptime_seconds: Math.floor(process.uptime()),
    env: process.env.NODE_ENV,
    services: {
      supabase:  !!process.env.SUPABASE_URL,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      razorpay:  !!process.env.RAZORPAY_KEY_ID,
      wati:      !!process.env.WATI_API_URL,
      n8n:       !!process.env.N8N_BASE_URL
    }
  });
});

// GET /api/admin/revenue
router.get('/revenue', async (req, res) => {
  const { data } = await supabase
    .from('transactions').select('amount, created_at').eq('status', 'success');

  const monthly = (data || []).reduce((acc, t) => {
    const month = t.created_at.slice(0, 7);
    acc[month] = (acc[month] || 0) + (t.amount / 100);
    return acc;
  }, {});
  res.json(monthly);
});

module.exports = router;
