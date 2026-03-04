import React, { useState } from 'react';
import { useCGAP } from '@/contexts/CGAPContext';
import { Lock, User, AlertCircle } from 'lucide-react';

const CGAPLogin: React.FC = () => {
  const { login } = useCGAP();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setTimeout(() => {
      if (!login(username, password)) {
        setError('Invalid credentials');
      }
      setLoading(false);
    }, 400);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0D0D0D' }}>
      <div className="w-full max-w-md px-6">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Playfair Display, serif', color: '#fff' }}>
            CGAP
          </h1>
          <p className="mt-2 text-sm" style={{ color: '#888', fontFamily: 'Inter, sans-serif' }}>
            Contract Generation & Automation Platform
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl p-8 space-y-6" style={{ background: '#161616', border: '1px solid #2A2A2A' }}>
          <div>
            <label className="block text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: '#888', fontFamily: 'Inter, sans-serif' }}>
              Username
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#555' }} />
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg text-sm outline-none transition-all"
                style={{ background: '#1C1C1C', border: '1px solid #2A2A2A', color: '#fff', fontFamily: 'Inter, sans-serif' }}
                onFocus={e => e.target.style.borderColor = '#4F7FFF'}
                onBlur={e => e.target.style.borderColor = '#2A2A2A'}
                placeholder="Enter username"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: '#888', fontFamily: 'Inter, sans-serif' }}>
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#555' }} />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg text-sm outline-none transition-all"
                style={{ background: '#1C1C1C', border: '1px solid #2A2A2A', color: '#fff', fontFamily: 'Inter, sans-serif' }}
                onFocus={e => e.target.style.borderColor = '#4F7FFF'}
                onBlur={e => e.target.style.borderColor = '#2A2A2A'}
                placeholder="Enter password"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm py-2 px-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: loading ? '#333' : '#4F7FFF',
              color: '#fff',
              fontFamily: 'Inter, sans-serif',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CGAPLogin;
