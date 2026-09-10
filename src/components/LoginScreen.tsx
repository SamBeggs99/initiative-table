import { useEffect, useState, type FormEvent } from 'react';
import { BloomCluster, SproutMark, VineRule } from './ornament/Botanical';
import { getSupabase } from '../lib/cloud/client';
import { useCloudAuth } from '../lib/cloud/auth-context';
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
  const { authReachable, continueOffline } = useCloudAuth();
  /*
   * Only offered when the auth server is genuinely unreachable AND this device
   * already holds campaigns. A deliberate sign-out clears the device, so a
   * clean install has nothing to offer and never shows this.
   */
  const localCampaigns = useStore((st) => st.campaigns.length);
  const canWorkOffline = !authReachable && localCampaigns > 0;
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
              <h1 className="text-base font-semibold text-text">Dungeon Master MultiTool</h1>
              <p className="text-xs text-muted">
                {authReachable
                  ? 'Sign in to load your campaigns on this device'
                  : 'Can’t reach the server — check your connection'}
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
            disabled={busy || !authReachable}
            title={
              authReachable
                ? undefined
                : 'Signing in needs a connection to your account'
            }
          >
            {busy
              ? 'Please wait…'
              : mode === 'login'
                ? 'Log in'
                : 'Create account'}
          </button>

          {canWorkOffline && (
            <>
              <VineRule />
              <div className="rounded border border-amber/50 bg-amber/10 px-3 py-2.5">
                <p className="text-xs leading-relaxed text-text">
                  There {localCampaigns === 1 ? 'is' : 'are'}{' '}
                  <b>
                    {localCampaigns} campaign{localCampaigns === 1 ? '' : 's'}
                  </b>{' '}
                  saved on this device. You can run tonight&apos;s session now
                  and it will reach your account when the connection is back.
                </p>
                <button
                  type="button"
                  className="btn btn-accent mt-2.5 w-full"
                  onClick={continueOffline}
                >
                  Work offline on this device
                </button>
              </div>
            </>
          )}

          <VineRule />
          <p className="text-xs leading-relaxed text-muted">
            Campaigns, party, homebrew, and portraits save to your account, so
            signing in on any device loads them. SRD monster and spell catalogs
            stay a per-device download — use Sync after you sign in.
          </p>
        </form>
      </div>
    </div>
  );
}
