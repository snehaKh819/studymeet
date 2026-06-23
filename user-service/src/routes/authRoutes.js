const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  try {
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'This email is already registered.' });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2)',
      [email, hashedPassword]
    );

    res.status(201).json({ message: 'User account created successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid login credentials.' });
    }

    const user = result.rows[0];

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(400).json({ message: 'Invalid login credentials.' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '2h' });

    res.cookie('token', token, {
      httpOnly: true, 
      secure: false, 
      maxAge: 7200000 
    });

    res.status(200).json({ 
      message: 'Login authenticated successfully!', 
      user: { id: user.id, email: user.email } 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.status(200).json({ message: 'Logged out successfully!' });
});

module.exports = router;