import { useEffect, useState, type FormEvent } from 'react';
import { BloomCluster, SproutMark, VineRule } from './ornament/Botanical';
import { getSupabase } from '../lib/cloud/client';
import { useStore } from '../store';

type Mode = 'login' | 'register';

function useApplyTheme(): void {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}

export function BootScreen({ message }: { message: string }) {
  useApplyTheme();
  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <SproutMark size={32} />
      <p className="mt-3 text-sm text-muted">{message}</p>
    </div>
  );
}

export function LoginScreen() {
  useApplyTheme();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabase();
    if (!client) {
      setError('Cloud is not configured.');
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'login') {
        const { error: signError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signError) throw signError;
      } else {
        const { data, error: signError } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: new URL(import.meta.env.BASE_URL, window.location.origin)
              .href,
          },
        });
        if (signError) throw signError;
        if (!data.session) {
          setInfo('Check your email to confirm the account, then log in.');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-start justify-center overflow-auto p-4">
      <div className="relative my-10 w-full max-w-md card overflow-hidden shadow-2xl">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <SproutMark size={24} />
            <div>
              <h1 className="text-base font-semibold text-text">Initiative Table</h1>
              <p className="text-xs text-muted">
                Sign in to load your campaigns on this device
              </p>
            </div>
          </div>
        </div>
        <form className="space-y-3 p-5" onSubmit={(e) => void submit(e)}>
          <div className="flex justify-center">
            <BloomCluster />
          </div>
          <div className="seg grid-cols-2" role="tablist" aria-label="Account">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className="seg-item"
              onClick={() => {
                setMode('login');
                setError(null);
                setInfo(null);
              }}
            >
              Log in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className="seg-item"
              onClick={() => {
                setMode('register');
                setError(null);
                setInfo(null);
              }}
            >
              Create account
            </button>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wider text-muted">
              Email
            </span>
            <input
              className="field w-full"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wider text-muted">
              Password
            </span>
            <input
              className="field w-full"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="text-xs text-damage">{error}</p>}
          {info && <p className="text-xs text-heal">{info}</p>}
          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={busy}
          >
            {busy
              ? 'Please wait…'
              : mode === 'login'
                ? 'Log in'
                : 'Create account'}
          </button>
          <VineRule />
          <p className="text-xs leading-relaxed text-muted">
            Campaigns, party, and homebrew save to your account. SRD monster and
            spell catalogs stay on this device — use Sync after you sign in.
          </p>
        </form>
      </div>
    </div>
  );
}
