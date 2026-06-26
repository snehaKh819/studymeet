import express from 'express';
import { register, login, logout } from '../controllers/authController.js';
import { createRoom, getRooms, getRoomById } from '../controllers/roomController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

router.post('/rooms', authenticate, createRoom);
router.get('/rooms', authenticate, getRooms);
router.get('/rooms/:id', authenticate, getRoomById);

export default router;