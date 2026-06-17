import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL || '';

interface Document {
  id: string;
  title: string;
  property_id: string | null;
  file_url: string | null;
  created_at: string;
}

function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    // Check if user is logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/login');
        return;
      }
      setUser(session.user);
      fetchDocuments(session.access_token);
    });

    // Listen for auth changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate('/login');
      } else {
        setUser(session.user);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [navigate]);

  const fetchDocuments = async (token: string) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/documents`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch documents');
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;

    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/api/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!res.ok) throw new Error('Failed to create document');
      setNewTitle('');
      fetchDocuments(token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-gray-600 text-sm">Welcome, {user.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
        >
          Logout
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleCreate} className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="New document title..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={creating}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50"
        >
          {creating ? 'Adding...' : 'Add Document'}
        </button>
      </form>

      {loading ? (
        <p className="text-gray-500">Loading documents...</p>
      ) : documents.length === 0 ? (
        <p className="text-gray-500">No documents yet. Create one above!</p>
      ) : (
        <div className="grid gap-4">
          {documents.map((doc) => (
            <div key={doc.id} className="p-4 bg-white rounded-lg border shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{doc.title}</h3>
                  <p className="text-sm text-gray-500">
                    Created {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
                {doc.file_url && (
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline text-sm"
                  >
                    View PDF
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
