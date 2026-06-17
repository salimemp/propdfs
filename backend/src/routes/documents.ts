import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * GET /api/documents
 * List all documents for the logged-in user.
 * Protected: requires valid Supabase JWT.
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      res.status(500).json({ error: 'Failed to fetch documents' });
      return;
    }

    res.json({ documents: data || [] });
  } catch (err) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/documents
 * Create a new document for the logged-in user.
 * Protected: requires valid Supabase JWT.
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { title, property_id, file_url } = req.body;

    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const { data, error } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        title,
        property_id: property_id || null,
        file_url: file_url || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      res.status(500).json({ error: 'Failed to create document' });
      return;
    }

    res.status(201).json({ document: data });
  } catch (err) {
    console.error('Error creating document:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/documents/:id
 * Get a single document by ID (only if owned by the user).
 */
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json({ document: data });
  } catch (err) {
    console.error('Error fetching document:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
