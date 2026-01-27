import { NextResponse } from 'next/server';

const CLICKUP_API_URL = 'https://api.clickup.com/api/v2';

export async function GET() {
    const apiKey = process.env.CLICKUP_API_KEY || '';
    const listId = process.env.CLICKUP_LIST_ID || '';

    const result: any = {
        credentials: {
            hasApiKey: !!apiKey,
            hasListId: !!listId,
            apiKeyLength: apiKey.length,
            listId: listId || 'MISSING'
        },
        tests: {}
    };

    if (!apiKey || !listId) {
        return NextResponse.json(result);
    }

    try {
        // Test 1: Fetch list info
        const listUrl = `${CLICKUP_API_URL}/list/${listId}`;
        const listResponse = await fetch(listUrl, {
            headers: { 'Authorization': apiKey },
            cache: 'no-store',
        });

        result.tests.listFetch = {
            status: listResponse.status,
            ok: listResponse.ok
        };

        if (listResponse.ok) {
            const listData = await listResponse.json();
            result.tests.listFetch.name = listData.name;
            result.tests.listFetch.statusCount = listData.statuses?.length || 0;
        } else {
            const errBody = await listResponse.text();
            result.tests.listFetch.errorBody = errBody.substring(0, 500);
        }

        // Test 2: Fetch tasks WITHOUT any date filter (first page only)
        const tasksUrl = `${CLICKUP_API_URL}/list/${listId}/task?page=0`;
        const tasksResponse = await fetch(tasksUrl, {
            headers: { 'Authorization': apiKey },
            cache: 'no-store',
        });

        result.tests.tasksFetch = {
            status: tasksResponse.status,
            ok: tasksResponse.ok
        };

        if (tasksResponse.ok) {
            const tasksData = await tasksResponse.json();
            const tasks = tasksData.tasks || [];
            result.tests.tasksFetch.count = tasks.length;

            if (tasks.length > 0) {
                // Show first 3 tasks with their date_created
                result.tests.tasksFetch.sampleTasks = tasks.slice(0, 3).map((t: any) => ({
                    id: t.id,
                    name: t.name?.substring(0, 50),
                    date_created: t.date_created,
                    date_created_iso: new Date(parseInt(t.date_created)).toISOString(),
                    status: t.status?.status
                }));
            }
        } else {
            const errBody = await tasksResponse.text();
            result.tests.tasksFetch.errorBody = errBody.substring(0, 500);
        }

        // Test 3: Fetch with 2026 filter
        const start2026 = new Date('2026-01-01T00:00:00Z').getTime();
        const tasksUrl2026 = `${CLICKUP_API_URL}/list/${listId}/task?page=0&date_created_gt=${start2026}`;
        const tasksResponse2026 = await fetch(tasksUrl2026, {
            headers: { 'Authorization': apiKey },
            cache: 'no-store',
        });

        if (tasksResponse2026.ok) {
            const tasksData2026 = await tasksResponse2026.json();
            result.tests.tasksWith2026Filter = {
                count: tasksData2026.tasks?.length || 0,
                filterDate: '2026-01-01T00:00:00Z',
                filterTimestamp: start2026
            };
        }

        // Add current date for reference
        result.currentDate = new Date().toISOString();
        result.currentTimestamp = Date.now();

    } catch (error) {
        result.error = String(error);
    }

    return NextResponse.json(result);
}
