import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import locationsRoutes from './routes/locations';
import attendanceRoutes from './routes/attendance';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/attendance', attendanceRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
