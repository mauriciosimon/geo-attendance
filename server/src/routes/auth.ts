import { Router, Request, Response } from 'express';
import { register, login, getUserById } from '../services/auth';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Register - DISABLED (users are created by admin only)
router.post('/register', async (req: Request, res: Response) => {
  return res.status(403).json({
    error: 'Public registration is disabled. Please contact your administrator to create an account.'
  });
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await login(email, password);
    res.json(result);
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
});

// Get current user profile
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await getUserById(req.user!.user_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
