import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
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
        assignedLocations: {
          select: {
            location: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { full_name: 'asc' },
    });

    // Flatten the assignedLocations for easier frontend use
    const usersWithLocations = users.map((user) => ({
      ...user,
      assignedLocations: user.assignedLocations.map((al) => al.location),
    }));

    res.json(usersWithLocations);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create user (admin only)
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, full_name, location_ids } = req.body;

    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Email, password, and full_name are required' });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Create user with location assignments
    const user = await prisma.user.create({
      data: {
        email,
        password_hash,
        full_name,
        role: 'employee',
        assignedLocations: {
          create: (location_ids || []).map((locationId: string) => ({
            location: { connect: { id: locationId } },
          })),
        },
      },
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        device_id: true,
        device_reset_requested: true,
        created_at: true,
        assignedLocations: {
          select: {
            location: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Flatten the assignedLocations
    const userWithLocations = {
      ...user,
      assignedLocations: user.assignedLocations.map((al) => al.location),
    };

    res.status(201).json(userWithLocations);
  } catch (error: any) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update user's assigned locations (admin only)
router.put('/:id/locations', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { location_ids } = req.body;

    if (!Array.isArray(location_ids)) {
      return res.status(400).json({ error: 'location_ids must be an array' });
    }

    // Delete existing assignments
    await prisma.userLocation.deleteMany({
      where: { user_id: id },
    });

    // Create new assignments
    if (location_ids.length > 0) {
      await prisma.userLocation.createMany({
        data: location_ids.map((locationId: string) => ({
          user_id: id,
          location_id: locationId,
        })),
      });
    }

    // Fetch updated user with locations
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        device_id: true,
        device_reset_requested: true,
        created_at: true,
        assignedLocations: {
          select: {
            location: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userWithLocations = {
      ...user,
      assignedLocations: user.assignedLocations.map((al) => al.location),
    };

    res.json(userWithLocations);
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

// Delete user (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Prevent deleting yourself
    if (id === req.user!.user_id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    // Delete attendance records first (foreign key constraint)
    await prisma.attendance.deleteMany({
      where: { user_id: id },
    });

    // Delete any locations created by the user
    await prisma.location.deleteMany({
      where: { created_by: id },
    });

    // Delete the user
    await prisma.user.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
