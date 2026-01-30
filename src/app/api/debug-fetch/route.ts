import { NextResponse } from 'next/server';

const CLICKUP_API_URL = 'https://api.clickup.com/api/v2';

// Extract numeric list ID from various ClickUp URL formats
function extractListId(input: string): string {
    // Format: 6-901305659240-1 → extract 901305659240
    const dashMatch = input.match(/^6-(\d+)-\d+$/);
    if (dashMatch) {
        return dashMatch[1];
    }

    // If it's already a pure number, return as-is
    if (/^\d+$/.test(input)) {
        return input;
    }

    // Format: 2y8rd-58473 (encoded format - may not work directly)
    // Return as-is and let ClickUp API handle it
    return input;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const withDateFilter = searchParams.get('withDateFilter') === 'true';

    const apiKey = process.env.CLICKUP_API_KEY || '';
    const rawListId = process.env.CLICKUP_LIST_ID || '';

    // Parse multiple list IDs and extract numeric IDs
    const listIds = rawListId
        .split(/[\n,\s]+/)
        .map(id => id.trim())
        .filter(id => id.length > 0)
        .map(id => extractListId(id));

    const listId = listIds[0] || ''; // Use first one for testing

    if (!apiKey || !listId) {
        return NextResponse.json({
            error: 'ClickUp credentials missing',
            hasApiKey: !!apiKey,
            hasListId: !!listId,
            rawListIdValue: rawListId || 'EMPTY',
            parsedListIds: listIds,
            apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'MISSING',
            listId: listId || 'MISSING'
        });
    }

    try {
        // Test 1: Fetch list info to verify credentials work
        const listUrl = `${CLICKUP_API_URL}/list/${listId}`;
        const listResponse = await fetch(listUrl, {
            headers: { 'Authorization': apiKey },
            cache: 'no-store',
        });

        const listData = await listResponse.json();

        if (!listResponse.ok) {
            return NextResponse.json({
                error: 'Failed to fetch list',
                status: listResponse.status,
                statusText: listResponse.statusText,
                body: listData
            }, { status: 500 });
        }

        // Test 2: Fetch tasks WITHOUT date filter
        const tasksUrlNoFilter = `${CLICKUP_API_URL}/list/${listId}/task?page=0&include_closed=true&subtasks=true`;
        const tasksResponseNoFilter = await fetch(tasksUrlNoFilter, {
            method: 'GET',
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
        });

        const tasksDataNoFilter = await tasksResponseNoFilter.json();
        const tasksNoFilter = tasksDataNoFilter.tasks || [];

        // Test 3: Fetch tasks WITH date filter (2026-01-01)
        const START_DATE_2026 = new Date('2026-01-01T00:00:00Z').getTime();
        const tasksUrlWithFilter = `${CLICKUP_API_URL}/list/${listId}/task?page=0&include_closed=true&subtasks=true&date_created_gt=${START_DATE_2026}`;
        const tasksResponseWithFilter = await fetch(tasksUrlWithFilter, {
            method: 'GET',
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
        });

        const tasksDataWithFilter = await tasksResponseWithFilter.json();
        const tasksWithFilter = tasksDataWithFilter.tasks || [];

        // Test 4: Fetch tasks WITH date filter (2025-01-01) - one year earlier
        const START_DATE_2025 = new Date('2025-01-01T00:00:00Z').getTime();
        const tasksUrlWith2025Filter = `${CLICKUP_API_URL}/list/${listId}/task?page=0&include_closed=true&subtasks=true&date_created_gt=${START_DATE_2025}`;
        const tasksResponseWith2025Filter = await fetch(tasksUrlWith2025Filter, {
            method: 'GET',
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
        });

        const tasksDataWith2025Filter = await tasksResponseWith2025Filter.json();
        const tasksWith2025Filter = tasksDataWith2025Filter.tasks || [];

        // Sample first task if available
        const sampleTask = tasksNoFilter.length > 0 ? {
            id: tasksNoFilter[0].id,
            name: tasksNoFilter[0].name,
            date_created: tasksNoFilter[0].date_created,
            date_created_readable: new Date(parseInt(tasksNoFilter[0].date_created)).toISOString(),
            status: tasksNoFilter[0].status?.status,
            assignees: tasksNoFilter[0].assignees?.map((a: any) => ({ id: a.id, username: a.username }))
        } : null;

        return NextResponse.json({
            configDebug: {
                rawEnvValue: rawListId,
                parsedListIds: listIds,
                usedListId: listId
            },
            listInfo: {
                id: listData.id,
                name: listData.name,
                statusCount: listData.statuses?.length || 0,
                statuses: listData.statuses?.map((s: any) => s.status) || []
            },
            tasksWithoutDateFilter: {
                count: tasksNoFilter.length,
                apiStatus: tasksResponseNoFilter.status
            },
            tasksWith2026Filter: {
                count: tasksWithFilter.length,
                apiStatus: tasksResponseWithFilter.status,
                filterTimestamp: START_DATE_2026,
                filterDate: new Date(START_DATE_2026).toISOString()
            },
            tasksWith2025Filter: {
                count: tasksWith2025Filter.length,
                apiStatus: tasksResponseWith2025Filter.status,
                filterTimestamp: START_DATE_2025,
                filterDate: new Date(START_DATE_2025).toISOString()
            },
            sampleTask,
            currentTimestamp: Date.now(),
            currentDate: new Date().toISOString()
        });
    } catch (error) {
        return NextResponse.json({
            error: String(error),
            stack: error instanceof Error ? error.stack : undefined
        }, { status: 500 });
    }
}
