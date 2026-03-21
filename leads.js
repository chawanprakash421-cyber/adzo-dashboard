const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const { authMiddleware } = require('./auth');

router.use(authMiddleware);

// GET /api/leads
router.get('/', async (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;
  let query = supabase
    .from('leads')
    .select('*')
    .eq('business_id', req.user.business_id)
    .order('created_at', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ leads: data || [] });
});

// GET /api/leads/follow-up
router.get('/follow-up', async (req, res) => {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('business_id', req.user.business_id)
    .eq('status', 'follow_up')
    .order('follow_up_date', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// GET /api/leads/stats
router.get('/stats', async (req, res) => {
  const { data } = await supabase
    .from('leads')
    .select('status')
    .eq('business_id', req.user.business_id);

  const summary = (data || []).reduce((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {});
  res.json({ total: (data || []).length, by_status: summary });
});

// GET /api/leads/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('leads').select('*')
    .eq('id', req.params.id).eq('business_id', req.user.business_id).single();
  if (error || !data) return res.status(404).json({ error: 'Lead not found' });
  res.json(data);
});

// POST /api/leads
router.post('/', async (req, res) => {
  const { name, phone, email, source, locality, property_type, budget, timeline } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });

  const { data, error } = await supabase.from('leads').insert({
    business_id: req.user.business_id,
    name, phone, email: email || null,
    source: source || 'manual',
    locality: locality || null,
    property_type: property_type || null,
    budget: budget || null,
    timeline: timeline || null,
    status: 'new',
    score: null
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/leads/:id
router.patch('/:id', async (req, res) => {
  const allowed = ['status', 'notes', 'follow_up_date', 'score', 'assigned_to'];
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => allowed.includes(k))
  );
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('leads').update(updates)
    .eq('id', req.params.id).eq('business_id', req.user.business_id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
