import { getEvolucaoData } from '@/lib/cached-data.service';
import { EvolucaoView } from './evolucao-view';

// Force dynamic rendering to always fetch fresh data
export const dynamic = 'force-dynamic';

export default async function EvolucaoPage() {
    const data = await getEvolucaoData();

    return (
        <EvolucaoView
            kpis={data.kpis}
            allVideos={data.allVideos}
            lastUpdated={data.lastUpdated}
        />
    );
}
