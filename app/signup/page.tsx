import Link from 'next/link';
import Signup from './signup';
import { authConfigured } from '@/lib/supabase/server';
import styles from '../login/login.module.css';
export const dynamic = 'force-dynamic';
export default function SignupPage() {
    return <main className={styles.screen}><section className={styles.panel} aria-labelledby="signup-title">
        <p className={styles.brand}>Resolvable Assess</p><h1 id="signup-title">Create your business account</h1>
        <p>Your team’s assessments and candidate results stay in your own workspace.</p>
        <Signup configured={authConfigured()} />
        <p className={styles.candidateHelp}>Already registered? <Link href="/login">Sign in</Link></p>
    </section></main>;
}
