import { Link } from 'react-router-dom';

function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <h1 className="text-5xl font-bold mb-4 text-blue-700">PropPDFs</h1>
      <p className="text-xl text-gray-600 mb-8 max-w-xl text-center">
        Property document management made simple. Upload, organize, and share your property PDFs securely.
      </p>
      <div className="flex gap-4">
        <Link
          to="/login"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
        >
          Get Started
        </Link>
        <Link
          to="/login"
          className="px-6 py-3 bg-white text-blue-600 border border-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition"
        >
          Sign In
        </Link>
      </div>
      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl w-full">
        <div className="p-6 bg-white rounded-xl shadow-sm border">
          <h3 className="font-bold text-lg mb-2">📄 Document Storage</h3>
          <p className="text-gray-600">Securely store all your property-related PDFs in one place.</p>
        </div>
        <div className="p-6 bg-white rounded-xl shadow-sm border">
          <h3 className="font-bold text-lg mb-2">🔒 Secure Access</h3>
          <p className="text-gray-600">Role-based access with Supabase authentication.</p>
        </div>
        <div className="p-6 bg-white rounded-xl shadow-sm border">
          <h3 className="font-bold text-lg mb-2">⚡ Fast Delivery</h3>
          <p className="text-gray-600">Global CDN via Cloudflare for instant document loading.</p>
        </div>
      </div>
    </div>
  );
}

export default Home;
