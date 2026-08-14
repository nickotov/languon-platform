import { HomeSessionActions } from '@/fsd/features/auth';

export function HomePage() {
    return (
        <main className='home'>
            <section className='home__content'>
                <div className='home__eyebrow'>AI-first language learning</div>
                <h1>Languon</h1>
                <p>
                    Learn through personalized courses, practical language
                    tools, and a tutor that adapts to your goals and progress.
                </p>
                <HomeSessionActions />
            </section>
        </main>
    );
}
