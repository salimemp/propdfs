import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

// Create a Supabase client with the service role key (for server-side verification)
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export interface AuthenticatedRequest extends Request {
  user?: any;
}

/**
 * Middleware to verify the Supabase JWT token sent from the frontend.
 * The frontend (Supabase client) sends a token in the Authorization header:
 *   Authorization: Bearer <jwt_token>
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify the JWT with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Attach user to request for use in route handlers
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
}
