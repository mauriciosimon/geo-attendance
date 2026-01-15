import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get all users (admin only)
router.get('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        device_id: true,
        device_reset_requested: true,
        created_at: true,
      },
      orderBy: { full_name: 'asc' },
    });
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user's profile
router.get('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.user_id },
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        device_id: true,
        device_reset_requested: true,
        created_at: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update device_id (for device binding)
router.patch('/device', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { device_id } = req.body;

    const user = await prisma.user.update({
      where: { id: req.user!.user_id },
      data: { device_id },
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        device_id: true,
        device_reset_requested: true,
        created_at: true,
      },
    });

    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Request device reset
router.post('/request-device-reset', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.user_id },
      data: { device_reset_requested: true },
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Reset device for user (admin only)
router.post('/:id/reset-device', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.update({
      where: { id },
      data: {
        device_id: null,
        device_reset_requested: false,
      },
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        device_id: true,
        device_reset_requested: true,
        created_at: true,
      },
    });

    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
