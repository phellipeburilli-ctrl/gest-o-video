import { clickupService } from "@/lib/clickup.service";
import { dataService } from "@/lib/data-service";
import ComparisonTable from "@/components/comparison-table";

// Helper to get data (Server Action pattern in Page)
async function getData() {
    const tasks = await clickupService.getTasks();
    const normalized = dataService.normalizeTasks(tasks);
    const kpis = dataService.calculateDashboardKPIs(normalized);
    return kpis;
}

export const revalidate = 300; // 5 minutes

export default async function ComparisonPage() {
    const data = await getData();

    return (
        <div className="min-h-screen bg-slate-950 text-slate-50 p-6 md:p-10 font-sans selection:bg-cyan-500/30">
            <ComparisonTable editors={data.editors} />
        </div>
    );
}
