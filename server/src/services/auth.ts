import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient, User } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

export interface TokenPayload {
  user_id: string;
  email: string;
  role: string;
}

export interface AuthResult {
  user: Omit<User, 'password_hash'>;
  token: string;
}

export async function register(
  email: string,
  password: string,
  fullName: string
): Promise<AuthResult> {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error('Email already registered');
  }

  const password_hash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      password_hash,
      full_name: fullName,
      role: 'employee',
    },
  });

  const token = generateToken(user);
  const { password_hash: _, ...userWithoutPassword } = user;

  return { user: userWithoutPassword, token };
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error('Invalid email or password');
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    throw new Error('Invalid email or password');
  }

  const token = generateToken(user);
  const { password_hash: _, ...userWithoutPassword } = user;

  return { user: userWithoutPassword, token };
}

export function generateToken(user: User): string {
  const payload: TokenPayload = {
    user_id: user.id,
    email: user.email,
    role: user.role,
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export async function getUserById(id: string): Promise<Omit<User, 'password_hash'> | null> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return null;

  const { password_hash: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}
