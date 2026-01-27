import { NextResponse } from 'next/server';
import { clickupService } from '@/lib/clickup.service';
import { AUDIOVISUAL_TEAM_IDS } from '@/lib/constants';

export async function GET() {
    try {
        const tasks = await clickupService.fetchTasks();

        // Collect all unique assignees
        const assigneesMap = new Map<number, { id: number; username: string; taskCount: number }>();

        tasks.forEach(task => {
            task.assignees.forEach(assignee => {
                if (!assigneesMap.has(assignee.id)) {
                    assigneesMap.set(assignee.id, {
                        id: assignee.id,
                        username: assignee.username,
                        taskCount: 0
                    });
                }
                assigneesMap.get(assignee.id)!.taskCount++;
            });
        });

        const allAssignees = Array.from(assigneesMap.values()).sort((a, b) => b.taskCount - a.taskCount);

        // Check specifically for ID 84241154 (Rafael Andrade)
        const rafaelTasks = tasks.filter(t => t.assignees.some(a => a.id === 84241154));

        return NextResponse.json({
            totalTasks: tasks.length,
            uniqueAssignees: allAssignees,
            teamIdsConfigured: AUDIOVISUAL_TEAM_IDS,
            rafaelAndrade: {
                id: 84241154,
                tasksFound: rafaelTasks.length,
                tasks: rafaelTasks.map(t => ({
                    id: t.id,
                    name: t.name,
                    status: t.status.status,
                    assignees: t.assignees.map(a => ({ id: a.id, username: a.username }))
                }))
            }
        });
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
