import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getUserByEmail, createUser, getAllUsers, getUserById } from '../db.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const TOKEN_EXPIRY = '7d';

// Middleware to verify JWT
export function requireAuth(req: Request, res: Response, next: () => void) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as { userId: number; role: string };
    (req as unknown as Record<string, unknown>).userId = payload.userId;
    (req as unknown as Record<string, unknown>).userRole = payload.role;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: () => void) {
  if ((req as unknown as Record<string, unknown>).userRole !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// POST /api/auth/login
router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  const user = getUserByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

// GET /api/auth/me — verify token and return user info
router.get('/me', requireAuth, (req: Request, res: Response) => {
  const userId = (req as unknown as Record<string, unknown>).userId as number;
  const user = getUserById(userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

// POST /api/auth/register — admin only (create accounts for accountant etc)
router.post('/register', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const { email, name, password, role } = req.body;
  if (!email || !name || !password) {
    res.status(400).json({ error: 'Email, name, and password required' });
    return;
  }

  if (getUserByEmail(email)) {
    res.status(409).json({ error: 'Email already exists' });
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  const user = createUser(email, name, hash, role || 'viewer');
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

// GET /api/auth/users — admin only
router.get('/users', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  res.json(getAllUsers());
});

// Bootstrap: create admin if no users exist
export function ensureAdminExists() {
  const users = getAllUsers();
  if (users.length === 0) {
    const hash = bcrypt.hashSync('admin', 10);
    createUser('kelly@pellas.au', 'Kelly Pellas', hash, 'admin');
    console.log('Created default admin: kelly@pellas.au / admin (CHANGE THIS PASSWORD)');
  }
}

export { router as authRouter };
