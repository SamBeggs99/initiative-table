import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';

export interface CloudAuthValue {
  configured: boolean;
  ready: boolean;
  session: Session | null;
  email: string | null;
  signOut: () => Promise<void>;
}

export const CloudAuthContext = createContext<CloudAuthValue>({
  configured: false,
  ready: true,
  session: null,
  email: null,
  signOut: async () => {},
});

export function useCloudAuth(): CloudAuthValue {
  return useContext(CloudAuthContext);
}
