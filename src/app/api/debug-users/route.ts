import { NextResponse } from 'next/server';

const CLICKUP_API_URL = 'https://api.clickup.com/api/v2';

// IDs dos editores válidos
const VALID_EDITOR_IDS = [
    248675265,  // Nathan Soares (VSL)
    84070913,   // Victor Mazzine (VSL)
    112053206,  // Moises Ramalho (Funil)
    152605916,  // Victor Mendes (Funil)
    3258937,    // Renato Fernandes (Funil)
    3272897,    // Douglas Prado (Funil)
    96683026,   // Leonardo da Silva (ADs - líder)
    84241154,   // Rafael Andrade (ADs)
    82093531,   // Loren Gayoso (TP/MIC/LEAD)
    82074101,   // Bruno Cesar (TP/MIC/LEAD)
];

export async function GET() {
    const apiKey = process.env.CLICKUP_API_KEY || '';
    const teamId = '3089165'; // Team ID from the ClickUp URLs provided

    if (!apiKey) {
        return NextResponse.json({ error: 'API key missing' });
    }

    try {
        // Fetch team members
        const teamUrl = `${CLICKUP_API_URL}/team/${teamId}`;
        const teamResponse = await fetch(teamUrl, {
            headers: { 'Authorization': apiKey },
            cache: 'no-store',
        });

        if (!teamResponse.ok) {
            const errorData = await teamResponse.json();
            return NextResponse.json({
                error: 'Failed to fetch team',
                status: teamResponse.status,
                body: errorData
            });
        }

        const teamData = await teamResponse.json();
        const members = teamData.team?.members || [];

        // Filter and format editor data
        const editorsData = members
            .filter((m: any) => VALID_EDITOR_IDS.includes(m.user?.id))
            .map((m: any) => ({
                id: m.user?.id,
                username: m.user?.username,
                email: m.user?.email,
                // ClickUp doesn't provide join date in team API, but we can check their first task
                profilePicture: m.user?.profilePicture,
                role: m.user?.role,
                // We'll need to find first task date for each
            }));

        // For each editor, find their earliest task to estimate join date
        const listIds = (process.env.CLICKUP_LIST_ID || '')
            .split(/[\n,\s]+/)
            .map(id => id.trim())
            .filter(id => id.length > 0);

        const editorFirstTasks: Record<number, { firstTaskDate: string; taskName: string }> = {};

        for (const listId of listIds) {
            for (const editor of editorsData) {
                // Search for tasks assigned to this editor, sorted by date_created ascending
                const tasksUrl = `${CLICKUP_API_URL}/list/${listId}/task?assignees[]=${editor.id}&order_by=created&reverse=false&page=0&subtasks=true&include_closed=true`;

                const tasksResponse = await fetch(tasksUrl, {
                    headers: { 'Authorization': apiKey },
                    cache: 'no-store',
                });

                if (tasksResponse.ok) {
                    const tasksData = await tasksResponse.json();
                    const tasks = tasksData.tasks || [];

                    if (tasks.length > 0) {
                        const firstTask = tasks[0];
                        const firstTaskDate = new Date(parseInt(firstTask.date_created)).toISOString();

                        // Only update if this is earlier than what we have
                        if (!editorFirstTasks[editor.id] ||
                            firstTaskDate < editorFirstTasks[editor.id].firstTaskDate) {
                            editorFirstTasks[editor.id] = {
                                firstTaskDate,
                                taskName: firstTask.name
                            };
                        }
                    }
                }
            }
        }

        // Combine data
        const result = editorsData.map((editor: any) => ({
            ...editor,
            estimatedJoinDate: editorFirstTasks[editor.id]?.firstTaskDate || 'Não encontrado',
            firstTask: editorFirstTasks[editor.id]?.taskName || 'Nenhuma tarefa',
        }));

        return NextResponse.json({
            teamName: teamData.team?.name,
            totalMembers: members.length,
            editors: result,
            allMemberIds: members.map((m: any) => ({
                id: m.user?.id,
                username: m.user?.username,
                isValidEditor: VALID_EDITOR_IDS.includes(m.user?.id)
            }))
        });
    } catch (error) {
        return NextResponse.json({
            error: String(error),
            stack: error instanceof Error ? error.stack : undefined
        }, { status: 500 });
    }
}
