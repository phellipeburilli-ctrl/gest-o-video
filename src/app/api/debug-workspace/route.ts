import { NextResponse } from 'next/server';

const CLICKUP_API_URL = 'https://api.clickup.com/api/v2';

export async function GET() {
    const apiKey = process.env.CLICKUP_API_KEY || '';

    if (!apiKey) {
        return NextResponse.json({ error: 'API Key não configurada' });
    }

    try {
        // Buscar workspaces (teams) disponíveis para esta API key
        const teamsUrl = `${CLICKUP_API_URL}/team`;
        const teamsResponse = await fetch(teamsUrl, {
            headers: { 'Authorization': apiKey },
            cache: 'no-store',
        });

        if (!teamsResponse.ok) {
            const errBody = await teamsResponse.text();
            return NextResponse.json({
                error: 'Falha ao buscar workspaces',
                status: teamsResponse.status,
                body: errBody
            });
        }

        const teamsData = await teamsResponse.json();
        const teams = teamsData.teams || [];

        // Para cada team, buscar spaces e lists
        const workspacesInfo = await Promise.all(teams.map(async (team: any) => {
            const spacesUrl = `${CLICKUP_API_URL}/team/${team.id}/space?archived=false`;
            const spacesResponse = await fetch(spacesUrl, {
                headers: { 'Authorization': apiKey },
                cache: 'no-store',
            });

            let spaces: any[] = [];
            if (spacesResponse.ok) {
                const spacesData = await spacesResponse.json();
                spaces = spacesData.spaces || [];
            }

            // Para cada space, buscar folders e lists
            const spacesWithLists = await Promise.all(spaces.map(async (space: any) => {
                // Buscar folders
                const foldersUrl = `${CLICKUP_API_URL}/space/${space.id}/folder?archived=false`;
                const foldersResponse = await fetch(foldersUrl, {
                    headers: { 'Authorization': apiKey },
                    cache: 'no-store',
                });

                let folders: any[] = [];
                if (foldersResponse.ok) {
                    const foldersData = await foldersResponse.json();
                    folders = foldersData.folders || [];
                }

                // Buscar lists em cada folder
                const foldersWithLists = await Promise.all(folders.map(async (folder: any) => {
                    const listsUrl = `${CLICKUP_API_URL}/folder/${folder.id}/list?archived=false`;
                    const listsResponse = await fetch(listsUrl, {
                        headers: { 'Authorization': apiKey },
                        cache: 'no-store',
                    });

                    let lists: any[] = [];
                    if (listsResponse.ok) {
                        const listsData = await listsResponse.json();
                        lists = listsData.lists || [];
                    }

                    return {
                        folderId: folder.id,
                        folderName: folder.name,
                        lists: lists.map((l: any) => ({
                            id: l.id,
                            name: l.name,
                            taskCount: l.task_count || 0
                        }))
                    };
                }));

                // Buscar lists diretamente no space (folderless lists)
                const folderlessUrl = `${CLICKUP_API_URL}/space/${space.id}/list?archived=false`;
                const folderlessResponse = await fetch(folderlessUrl, {
                    headers: { 'Authorization': apiKey },
                    cache: 'no-store',
                });

                let folderlessLists: any[] = [];
                if (folderlessResponse.ok) {
                    const folderlessData = await folderlessResponse.json();
                    folderlessLists = folderlessData.lists || [];
                }

                return {
                    spaceId: space.id,
                    spaceName: space.name,
                    folders: foldersWithLists,
                    folderlessLists: folderlessLists.map((l: any) => ({
                        id: l.id,
                        name: l.name,
                        taskCount: l.task_count || 0
                    }))
                };
            }));

            return {
                teamId: team.id,
                teamName: team.name,
                spaces: spacesWithLists
            };
        }));

        // Extrair todas as lists para facilitar visualização
        const allLists: any[] = [];
        for (const ws of workspacesInfo) {
            for (const space of ws.spaces) {
                for (const folder of space.folders) {
                    for (const list of folder.lists) {
                        allLists.push({
                            listId: list.id,
                            listName: list.name,
                            folderName: folder.folderName,
                            spaceName: space.spaceName,
                            teamName: ws.teamName,
                            taskCount: list.taskCount
                        });
                    }
                }
                for (const list of space.folderlessLists) {
                    allLists.push({
                        listId: list.id,
                        listName: list.name,
                        folderName: '(sem pasta)',
                        spaceName: space.spaceName,
                        teamName: ws.teamName,
                        taskCount: list.taskCount
                    });
                }
            }
        }

        // Verificar se os IDs configurados estão na lista
        const rawListId = process.env.CLICKUP_LIST_ID || '';
        const configuredIds = rawListId.split(/[\n,\s]+/).map(id => id.trim()).filter(id => id.length > 0);
        const foundIds = configuredIds.filter(id => allLists.some(l => l.listId === id));
        const missingIds = configuredIds.filter(id => !allLists.some(l => l.listId === id));

        return NextResponse.json({
            configuredListIds: configuredIds,
            foundInWorkspace: foundIds,
            notFoundInWorkspace: missingIds,
            availableLists: allLists,
            workspacesDetails: workspacesInfo
        });

    } catch (error) {
        return NextResponse.json({
            error: String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
    }
}
