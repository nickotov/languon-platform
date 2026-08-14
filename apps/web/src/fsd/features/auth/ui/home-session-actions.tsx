'use client';

import Link from 'next/link';

import { useSessionStore } from '@/fsd/entities/session/model/session-store';
import { useAuth } from '../model/auth-provider';

export function HomeSessionActions() {
    const status = useSessionStore((state) => state.status);
    const user = useSessionStore((state) => state.user);
    const { capabilities } = useAuth();

    if (status === 'bootstrapping') {
        return (
            <p className='loading-state' role='status'>
                Restoring your account…
            </p>
        );
    }

    if (status === 'authenticated') {
        return (
            <div className='home__account'>
                <p>Signed in as {user?.primaryEmail}</p>
                <Link className='primary-button' href='/security'>
                    Security settings
                </Link>
            </div>
        );
    }

    return (
        <nav className='home__actions' aria-label='Account'>
            {capabilities?.email.signUp ? (
                <Link className='primary-button' href='/signup'>
                    Get started
                </Link>
            ) : null}
            <Link className='secondary-button' href='/login'>
                Sign in
            </Link>
        </nav>
    );
}
