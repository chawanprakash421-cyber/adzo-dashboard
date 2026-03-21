const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const supabase = require('../db/supabase');
const { authMiddleware } = require('./auth');

router.use(authMiddleware);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CONTENT_PROMPTS = {
  social_post: (topic, tone) =>
    `Write a ${tone} social media post for an Indian real estate business about: ${topic}. 
     Make it engaging, use emojis, keep it under 200 words. Write in a way that gets enquiries.`,
  whatsapp: (topic, tone) =>
    `Write a ${tone} WhatsApp message for an Indian real estate agent to send to a lead about: ${topic}.
     Keep it conversational, under 100 words, end with a clear call to action.`,
  property_desc: (topic, tone) =>
    `Write a ${tone} property listing description for: ${topic}.
     Include key highlights, location benefits, and a compelling close. Under 150 words.`,
  google_ad: (topic, tone) =>
    `Write a Google Ad for an Indian real estate agency about: ${topic}.
     Format: Headline (30 chars max) + Description (90 chars max). Make it click-worthy.`,
  email: (topic, tone) =>
    `Write a ${tone} email campaign for an Indian real estate business about: ${topic}.
     Include subject line, body (under 200 words), and a clear CTA.`,
};

// GET /api/content
router.get('/', async (req, res) => {
  const { type, status, limit = 20, offset = 0 } = req.query;
  let query = supabase
    .from('content_items')
    .select('*')
    .eq('business_id', req.user.business_id)
    .order('created_at', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (type) query = query.eq('content_type', type);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/content/generate — generates content directly via Claude API
router.post('/generate', async (req, res) => {
  const { content_type, topic, tone = 'professional' } = req.body;
  if (!content_type || !topic)
    return res.status(400).json({ error: 'content_type and topic required' });

  const promptFn = CONTENT_PROMPTS[content_type];
  if (!promptFn) return res.status(400).json({ error: 'Invalid content_type' });

  // Insert pending record
  const { data: record, error: insertErr } = await supabase
    .from('content_items')
    .insert({
      business_id: req.user.business_id,
      content_type, topic, tone, status: 'generating'
    }).select().single();
  if (insertErr) return res.status(500).json({ error: insertErr.message });

  // Generate with Claude (async — respond immediately then update)
  res.status(202).json({ content_id: record.id, status: 'generating' });

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: promptFn(topic, tone) }]
    });

    const body_text = message.content[0]?.text || '';
    await supabase.from('content_items').update({
      body_text, status: 'ready', updated_at: new Date().toISOString()
    }).eq('id', record.id);
  } catch (err) {
    console.error('Claude API error:', err.message);
    await supabase.from('content_items').update({
      status: 'error', updated_at: new Date().toISOString()
    }).eq('id', record.id);
  }
});

// GET /api/content/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('content_items').select('*')
    .eq('id', req.params.id).eq('business_id', req.user.business_id).single();
  if (error || !data) return res.status(404).json({ error: 'Content not found' });
  res.json(data);
});

// PATCH /api/content/:id
router.patch('/:id', async (req, res) => {
  const { body_text, status } = req.body;
  const { data, error } = await supabase
    .from('content_items').update({ body_text, status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('business_id', req.user.business_id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/content/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('content_items').delete()
    .eq('id', req.params.id).eq('business_id', req.user.business_id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Deleted' });
});

module.exports = router;
