import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get locations (admins see all, employees see only assigned)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.user_id;
    const userRole = req.user!.role;

    // Admins see all locations
    if (userRole === 'admin') {
      const locations = await prisma.location.findMany({
        orderBy: { created_at: 'desc' },
      });
      return res.json(locations);
    }

    // Employees only see assigned locations
    const userWithLocations = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        assignedLocations: {
          select: {
            location: true,
          },
        },
      },
    });

    const locations = userWithLocations?.assignedLocations.map((al) => al.location) || [];
    res.json(locations);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create location (admin only)
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, latitude, longitude, radius_meters } = req.body;

    if (!name || latitude === undefined || longitude === undefined || !radius_meters) {
      return res.status(400).json({ error: 'Name, latitude, longitude, and radius_meters are required' });
    }

    const location = await prisma.location.create({
      data: {
        name,
        latitude,
        longitude,
        radius_meters,
        created_by: req.user!.user_id,
      },
    });

    res.status(201).json(location);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update location (admin only)
router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, latitude, longitude, radius_meters } = req.body;

    const location = await prisma.location.update({
      where: { id },
      data: {
        name,
        latitude,
        longitude,
        radius_meters,
      },
    });

    res.json(location);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete location (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.location.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
