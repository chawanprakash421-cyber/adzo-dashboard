const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const supabase = require('../db/supabase');
const { authMiddleware } = require('./auth');

router.use(authMiddleware);

const PLANS = {
  starter:      { name: 'Starter',      amount: 99900  },
  growth:       { name: 'Growth',       amount: 299900 },
  professional: { name: 'Professional', amount: 799900 },
  enterprise:   { name: 'Enterprise',   amount: 2499900}
};

const getRazorpay = () => new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID     || 'placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder'
});

// GET /api/wallet
router.get('/', async (req, res) => {
  const { data: wallet } = await supabase
    .from('wallets').select('*')
    .eq('business_id', req.user.business_id).single();

  const { data: transactions } = await supabase
    .from('transactions').select('*')
    .eq('business_id', req.user.business_id)
    .order('created_at', { ascending: false }).limit(20);

  res.json({ wallet: wallet || null, transactions: transactions || [] });
});

// GET /api/wallet/plans
router.get('/plans', (req, res) => {
  res.json(Object.entries(PLANS).map(([id, p]) => ({
    id, name: p.name, amount: p.amount / 100, currency: 'INR'
  })));
});

// POST /api/wallet/create-order
router.post('/create-order', async (req, res) => {
  const { plan_id, top_up_amount } = req.body;
  let amount;

  if (plan_id) {
    if (!PLANS[plan_id]) return res.status(400).json({ error: 'Invalid plan_id' });
    amount = PLANS[plan_id].amount;
  } else if (top_up_amount) {
    if (Number(top_up_amount) < 500) return res.status(400).json({ error: 'Minimum top-up ₹500' });
    amount = Number(top_up_amount) * 100;
  } else {
    return res.status(400).json({ error: 'Provide plan_id or top_up_amount' });
  }

  try {
    const order = await getRazorpay().orders.create({
      amount, currency: 'INR',
      receipt: `adzo_${req.user.business_id}_${Date.now()}`,
      notes: { business_id: req.user.business_id, plan_id: plan_id || null, type: plan_id ? 'subscription' : 'topup' }
    });
    res.json({ order_id: order.id, amount: order.amount, currency: order.currency, razorpay_key: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create order: ' + err.message });
  }
});

// POST /api/wallet/verify-payment
router.post('/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expected !== razorpay_signature)
    return res.status(400).json({ error: 'Payment verification failed' });

  await supabase.from('transactions').insert({
    business_id: req.user.business_id,
    razorpay_order_id, razorpay_payment_id,
    status: 'success', verified_at: new Date().toISOString()
  });

  res.json({ message: 'Payment verified. Plan activating shortly.' });
});

module.exports = router;
