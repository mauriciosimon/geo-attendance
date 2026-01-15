import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get current user's attendance
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { start, end, location_id } = req.query;

    const where: any = { user_id: req.user!.user_id };

    if (start) {
      where.timestamp = { ...where.timestamp, gte: new Date(start as string) };
    }
    if (end) {
      where.timestamp = { ...where.timestamp, lte: new Date(end as string) };
    }
    if (location_id) {
      where.location_id = location_id;
    }

    const attendance = await prisma.attendance.findMany({
      where,
      include: { location: true },
      orderBy: { timestamp: 'desc' },
    });

    res.json(attendance);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get last attendance record for current user
router.get('/last', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const lastRecord = await prisma.attendance.findFirst({
      where: { user_id: req.user!.user_id },
      orderBy: { timestamp: 'desc' },
    });

    res.json(lastRecord);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Check in/out
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { status, latitude, longitude, location_id } = req.body;

    if (!status || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Status, latitude, and longitude are required' });
    }

    if (status !== 'check_in' && status !== 'check_out') {
      return res.status(400).json({ error: 'Status must be check_in or check_out' });
    }

    const record = await prisma.attendance.create({
      data: {
        user_id: req.user!.user_id,
        status,
        latitude,
        longitude,
        location_id: location_id || null,
      },
    });

    res.status(201).json(record);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get attendance for a specific user (admin only)
router.get('/user/:userId', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { start, end, location_id } = req.query;

    const where: any = { user_id: userId };

    if (start) {
      where.timestamp = { ...where.timestamp, gte: new Date(start as string) };
    }
    if (end) {
      where.timestamp = { ...where.timestamp, lte: new Date(end as string) };
    }
    if (location_id) {
      where.location_id = location_id;
    }

    const attendance = await prisma.attendance.findMany({
      where,
      include: { location: true },
      orderBy: { timestamp: 'desc' },
    });

    res.json(attendance);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all attendance (admin only) - for reports
router.get('/all', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { start, end, location_id, user_id } = req.query;

    const where: any = {};

    if (start) {
      where.timestamp = { ...where.timestamp, gte: new Date(start as string) };
    }
    if (end) {
      where.timestamp = { ...where.timestamp, lte: new Date(end as string) };
    }
    if (location_id) {
      where.location_id = location_id;
    }
    if (user_id) {
      where.user_id = user_id;
    }

    const attendance = await prisma.attendance.findMany({
      where,
      include: {
        location: true,
        user: {
          select: {
            id: true,
            email: true,
            full_name: true,
          },
        },
      },
      orderBy: { timestamp: 'desc' },
    });

    res.json(attendance);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
