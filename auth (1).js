const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('./supabase');

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, business_id: user.business_id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Unauthorised' });
  try {
    req.user = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, name, business_name, phone } = req.body;
  if (!email || !password || !name)
    return res.status(400).json({ error: 'email, password and name required' });

  const hash = await bcrypt.hash(password, 12);

  // Create business record
  const { data: business, error: bErr } = await supabase
    .from('businesses')
    .insert({ name: business_name || name, phone, status: 'trial', plan: 'trial' })
    .select().single();
  if (bErr) return res.status(500).json({ error: bErr.message });

  // Create user record
  const { data: user, error: uErr } = await supabase
    .from('users')
    .insert({ email, password_hash: hash, name, role: 'client', business_id: business.id })
    .select().single();
  if (uErr) {
    await supabase.from('businesses').delete().eq('id', business.id);
    if (uErr.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    return res.status(500).json({ error: uErr.message });
  }

  // Create wallet record
  await supabase.from('wallets').insert({ business_id: business.id, balance: 0 });

  const token = signToken(user);
  res.status(201).json({
    token,
    user: { id: user.id, email, name, role: user.role, business_id: business.id }
  });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const { data: user, error } = await supabase
    .from('users').select('*').eq('email', email).single();
  if (error || !user) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  await supabase.from('users').update({ last_login: new Date() }).eq('id', user.id);

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, business_id: user.business_id }
  });
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, role, business_id, created_at')
    .eq('id', req.user.id).single();
  if (error) return res.status(404).json({ error: 'User not found' });
  res.json(data);
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body;
  const { data: user } = await supabase.from('users').select('password_hash').eq('id', req.user.id).single();
  const valid = await bcrypt.compare(current_password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password incorrect' });
  const hash = await bcrypt.hash(new_password, 12);
  await supabase.from('users').update({ password_hash: hash }).eq('id', req.user.id);
  res.json({ message: 'Password updated' });
});

module.exports = router;
module.exports.authMiddleware = authMiddleware;
