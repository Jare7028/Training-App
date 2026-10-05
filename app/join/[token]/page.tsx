import GeneralCandidate from '@/app/general-candidate';
export const dynamic = 'force-dynamic';
export default async function Join({params}:{params:Promise<{token:string}>}) {
    const {token} = await params;
    return <GeneralCandidate token={token}/>;
}
