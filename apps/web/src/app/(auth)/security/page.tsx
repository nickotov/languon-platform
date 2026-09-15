import { permanentRedirect } from 'next/navigation';

export default function Page() {
    permanentRedirect('/profile?tab=security');
}
