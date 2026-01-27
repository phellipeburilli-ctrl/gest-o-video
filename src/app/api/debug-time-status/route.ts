import { NextResponse } from 'next/server';
import { clickupService } from '@/lib/clickup.service';

const CLICKUP_API_URL = 'https://api.clickup.com/api/v2';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');
    const apiKey = process.env.CLICKUP_API_KEY || '';
    const listId = process.env.CLICKUP_LIST_ID || '';

    if (!apiKey) {
        return NextResponse.json({ error: 'ClickUp credentials missing' }, { status: 500 });
    }

    try {
        // First, get the list statuses to understand status names
        const listStatusesUrl = `${CLICKUP_API_URL}/list/${listId}`;
        const listResponse = await fetch(listStatusesUrl, {
            headers: { 'Authorization': apiKey },
            cache: 'no-store',
        });
        const listData = await listResponse.json();
        const statuses = listData.statuses || [];

        // Create a map of status_id -> status_name
        const statusMap: { [id: string]: string } = {};
        statuses.forEach((s: { id: string; status: string }) => {
            statusMap[s.id] = s.status;
        });

        // If a specific task ID is provided, show detailed info for that task
        if (taskId) {
            const url = `${CLICKUP_API_URL}/task/${taskId}/time_in_status`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': apiKey,
                    'Content-Type': 'application/json',
                },
                cache: 'no-store',
            });

            const rawData = await response.json();

            // Parse the time in status data with status names
            const parsedData: { [statusName: string]: { timeMs: number; timeHours: number } } = {};

            if (rawData.current_status) {
                for (const [statusId, data] of Object.entries(rawData.current_status)) {
                    const statusName = statusMap[statusId] || statusId;
                    const timeMs = (data as any).total_time?.by_minute * 60 * 1000 || (data as any).time || 0;
                    parsedData[statusName] = {
                        timeMs,
                        timeHours: parseFloat((timeMs / 3600000).toFixed(2))
                    };
                }
            }

            return NextResponse.json({
                taskId,
                apiStatus: response.status,
                rawApiResponse: rawData,
                statusMap,
                parsedTimeByStatusName: parsedData,
                explanation: {
                    note: "Este é o retorno bruto da API do ClickUp para time_in_status",
                    statusMapNote: "O mapa de status converte IDs em nomes legíveis",
                    parsedNote: "parsedTimeByStatusName mostra o tempo em cada status com nome legível"
                }
            });
        }

        // Otherwise, fetch a few sample tasks and their time in status
        const tasks = await clickupService.fetchTasks();
        const sampleTasks = tasks.slice(0, 5); // First 5 tasks

        const results = await Promise.all(sampleTasks.map(async (task) => {
            const url = `${CLICKUP_API_URL}/task/${task.id}/time_in_status`;

            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': apiKey,
                        'Content-Type': 'application/json',
                    },
                    cache: 'no-store',
                });

                const data = await response.json();

                // Parse with status names
                const parsedData: { [statusName: string]: { timeMs: number; timeHours: number } } = {};

                if (data.current_status) {
                    for (const [statusId, statusData] of Object.entries(data.current_status)) {
                        const statusName = statusMap[statusId] || statusId;
                        const timeMs = (statusData as any).total_time?.by_minute * 60 * 1000 || (statusData as any).time || 0;
                        parsedData[statusName] = {
                            timeMs,
                            timeHours: parseFloat((timeMs / 3600000).toFixed(2))
                        };
                    }
                }

                return {
                    taskId: task.id,
                    taskName: task.name,
                    currentStatus: task.status.status,
                    assignee: task.assignees[0]?.username || 'N/A',
                    apiStatus: response.status,
                    rawTimeInStatus: data,
                    parsedTimeByStatusName: parsedData
                };
            } catch (error) {
                return {
                    taskId: task.id,
                    taskName: task.name,
                    error: String(error)
                };
            }
        }));

        return NextResponse.json({
            totalTasksFetched: tasks.length,
            sampleSize: sampleTasks.length,
            statusMap,
            availableStatuses: statuses.map((s: { status: string }) => s.status),
            sampleResults: results,
            hint: "Adicione ?taskId=XXXXX para ver detalhes de uma tarefa específica"
        });
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
