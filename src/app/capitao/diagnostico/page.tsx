import { getDiagnosticoData } from '@/lib/cached-data.service';
import { DiagnosticoView } from './diagnostico-view';

// Force dynamic rendering to always fetch fresh data
export const dynamic = 'force-dynamic';

export default async function DiagnosticoPage() {
    const data = await getDiagnosticoData();

    return (
        <DiagnosticoView
            kpis={data.kpis}
            thisWeekVideos={data.thisWeekVideos}
            lastWeekVideos={data.lastWeekVideos}
            allVideos={data.allVideos}
            lastUpdated={data.lastUpdated}
        />
    );
}
