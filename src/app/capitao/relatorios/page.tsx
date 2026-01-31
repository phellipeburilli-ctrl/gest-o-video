import { getRelatoriosData } from '@/lib/cached-data.service';
import { RelatoriosView } from './relatorios-view';

// Force dynamic rendering to always fetch fresh data
export const dynamic = 'force-dynamic';

export default async function RelatoriosPage() {
    const data = await getRelatoriosData();

    return (
        <RelatoriosView
            kpis={data.kpis}
            allVideos={data.allVideos}
            lastUpdated={data.lastUpdated}
        />
    );
}
