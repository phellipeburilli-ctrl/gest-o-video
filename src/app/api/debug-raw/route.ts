import { NextResponse } from 'next/server';

const CLICKUP_API_URL = 'https://api.clickup.com/api/v2';

export async function GET() {
    const apiKey = process.env.CLICKUP_API_KEY || '';
    const rawListId = process.env.CLICKUP_LIST_ID || '';

    // Parse multiple list IDs separated by newline, comma, or space
    const listIds = rawListId
        .split(/[\n,\s]+/)
        .map(id => id.trim())
        .filter(id => id.length > 0);

    const result: any = {
        credentials: {
            hasApiKey: !!apiKey,
            hasListIds: listIds.length > 0,
            apiKeyLength: apiKey.length,
            listIds: listIds,
            rawListIdValue: rawListId.replace(/\n/g, '\\n')  // Show newlines explicitly
        },
        tests: {}
    };

    if (!apiKey || listIds.length === 0) {
        return NextResponse.json(result);
    }

    try {
        // Test each list ID
        result.tests.listResults = [];

        for (const listId of listIds) {
            const listTest: any = { listId };

            // Test 1: Fetch list info
            const listUrl = `${CLICKUP_API_URL}/list/${listId}`;
            const listResponse = await fetch(listUrl, {
                headers: { 'Authorization': apiKey },
                cache: 'no-store',
            });

            listTest.listFetch = {
                status: listResponse.status,
                ok: listResponse.ok
            };

            if (listResponse.ok) {
                const listData = await listResponse.json();
                listTest.listFetch.name = listData.name;
                listTest.listFetch.statusCount = listData.statuses?.length || 0;
            } else {
                const errBody = await listResponse.text();
                listTest.listFetch.errorBody = errBody.substring(0, 500);
            }

            // Test 2: Fetch tasks WITHOUT any date filter (first page only)
            const tasksUrl = `${CLICKUP_API_URL}/list/${listId}/task?page=0`;
            const tasksResponse = await fetch(tasksUrl, {
                headers: { 'Authorization': apiKey },
                cache: 'no-store',
            });

            listTest.tasksFetch = {
                status: tasksResponse.status,
                ok: tasksResponse.ok
            };

            if (tasksResponse.ok) {
                const tasksData = await tasksResponse.json();
                const tasks = tasksData.tasks || [];
                listTest.tasksFetch.count = tasks.length;

                if (tasks.length > 0) {
                    // Show first 3 tasks with their date_created
                    listTest.tasksFetch.sampleTasks = tasks.slice(0, 3).map((t: any) => ({
                        id: t.id,
                        name: t.name?.substring(0, 50),
                        date_created: t.date_created,
                        date_created_iso: new Date(parseInt(t.date_created)).toISOString(),
                        status: t.status?.status
                    }));
                }
            } else {
                const errBody = await tasksResponse.text();
                listTest.tasksFetch.errorBody = errBody.substring(0, 500);
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
                listTest.tasksWith2026Filter = {
                    count: tasksData2026.tasks?.length || 0,
                    filterDate: '2026-01-01T00:00:00Z',
                    filterTimestamp: start2026
                };
            }

            result.tests.listResults.push(listTest);
        }

        // Add current date for reference
        result.currentDate = new Date().toISOString();
        result.currentTimestamp = Date.now();

    } catch (error) {
        result.error = String(error);
    }

    return NextResponse.json(result);
}
