import Candidate from '@/app/candidate';
export const dynamic = 'force-dynamic';
export default async function Take({ params }: {
    params: Promise<{
        token: string;
    }>;
}) { const { token } = await params; return <Candidate token={token}/>; }
