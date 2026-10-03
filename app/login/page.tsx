import Login from './login';
import { authConfigured } from '@/lib/supabase/server';
import styles from './login.module.css';
export const dynamic = 'force-dynamic';
export default function LoginPage() {
    return <main className={styles.screen}><section className={styles.panel} aria-labelledby="sign-in-title"><p className={styles.brand}>Resolvable Assess</p><h1 id="sign-in-title">Sign in</h1><Login configured={authConfigured()} /></section></main>;
}
