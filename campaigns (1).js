const express = require('express');
const router = express.Router();
const supabase = require('./supabase');
const { authMiddleware } = require('./auth');

router.use(authMiddleware);

// GET /api/campaigns
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('campaigns').select('*')
    .eq('business_id', req.user.business_id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// GET /api/campaigns/totals
router.get('/totals', async (req, res) => {
  const { data } = await supabase
    .from('campaigns').select('total_spend, total_leads, status')
    .eq('business_id', req.user.business_id);

  const totals = (data || []).reduce(
    (acc, c) => ({ total_spend: acc.total_spend + (c.total_spend || 0), total_leads: acc.total_leads + (c.total_leads || 0) }),
    { total_spend: 0, total_leads: 0 }
  );
  res.json({ campaigns: data, totals });
});

// GET /api/campaigns/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('campaigns').select('*')
    .eq('id', req.params.id).eq('business_id', req.user.business_id).single();
  if (error || !data) return res.status(404).json({ error: 'Campaign not found' });
  res.json(data);
});

// POST /api/campaigns
router.post('/', async (req, res) => {
  const { name, platform, daily_budget, target_locality, ad_copy, objective } = req.body;
  if (!name || !platform || !daily_budget)
    return res.status(400).json({ error: 'name, platform, daily_budget required' });

  const { data, error } = await supabase.from('campaigns').insert({
    business_id: req.user.business_id,
    name, platform,
    objective: objective || 'lead_generation',
    daily_budget: Number(daily_budget),
    target_locality: target_locality || null,
    ad_copy: ad_copy || null,
    status: 'draft',
    total_spend: 0,
    total_leads: 0
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/campaigns/:id
router.patch('/:id', async (req, res) => {
  const allowed = ['name', 'status', 'daily_budget', 'ad_copy', 'end_date'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('campaigns').update(updates)
    .eq('id', req.params.id).eq('business_id', req.user.business_id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
