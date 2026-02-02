import { NextResponse } from 'next/server';
import { testConnection, getTableCounts, getTeams, getEditors } from '@/lib/db.service';

export async function GET() {
    try {
        // Testar conexão
        const isConnected = await testConnection();

        if (!isConnected) {
            return NextResponse.json({
                success: false,
                error: 'Não foi possível conectar ao banco de dados',
                hint: 'Verifique se POSTGRES_URL está configurado no Vercel'
            }, { status: 500 });
        }

        // Contar registros nas tabelas
        const counts = await getTableCounts();

        // Buscar dados de exemplo
        const teams = await getTeams();
        const editors = await getEditors();

        return NextResponse.json({
            success: true,
            message: 'Conexão com banco de dados OK!',
            database: {
                connected: true,
                tables: counts
            },
            data: {
                teams: teams.map(t => ({ id: t.id, name: t.name, color: t.color })),
                editors: editors.map(e => ({
                    id: e.id,
                    name: e.name,
                    team_id: e.team_id,
                    role: e.role,
                    admission_date: e.admission_date
                }))
            }
        });
    } catch (error) {
        console.error('Database test error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Erro desconhecido',
            hint: 'Verifique se POSTGRES_URL está configurado corretamente no Vercel'
        }, { status: 500 });
    }
}
