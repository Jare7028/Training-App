import 'server-only';
import { serviceClient } from '@/lib/supabase/admin';
import { createStore } from './store';

// Only bearer-link processing and server-managed account provisioning use this
// path. Ordinary workspace reads and writes use the caller's session and RLS.
export const { allRows, firstRow, insertRow, updateRows } = createStore(serviceClient);
export { hashToken, type RecordRow } from './store';
