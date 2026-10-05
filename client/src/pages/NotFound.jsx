import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <div className="text-6xl font-bold text-ink-300">404</div>
      <p className="text-ink-500">The page you're looking for doesn't exist.</p>
      <Link to="/" className="btn-primary">Back to Dashboard</Link>
    </div>
  );
}