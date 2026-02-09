#!/usr/bin/env node

/**
 * Script para rodar sincronização manualmente
 *
 * Uso:
 *   node scripts/sync-now.js [URL_VERCEL]
 *
 * Exemplo:
 *   node scripts/sync-now.js https://meu-app.vercel.app
 */

const baseUrl = process.argv[2] || 'http://localhost:3000';

async function runSync() {
    console.log('🔄 Iniciando sincronização...');
    console.log(`📡 URL: ${baseUrl}/api/sync`);

    try {
        const response = await fetch(`${baseUrl}/api/sync`);
        const data = await response.json();

        if (data.success) {
            console.log('\n✅ Sincronização concluída com sucesso!');
            console.log(`⏱️  Duração: ${data.duration_ms}ms`);
            console.log('\n📊 Estatísticas:');
            console.log(`   - Tasks processadas: ${data.stats.tasksProcessed}`);
            console.log(`   - Tasks salvas: ${data.stats.tasksSaved}`);
            console.log(`   - Métricas semanais: ${data.stats.weeklyMetricsSaved}`);
            console.log(`   - Métricas mensais: ${data.stats.monthlyMetricsSaved}`);
            console.log(`   - Métricas trimestrais: ${data.stats.quarterlyMetricsSaved}`);

            if (data.stats.errors.length > 0) {
                console.log('\n⚠️  Erros encontrados:');
                data.stats.errors.forEach(err => console.log(`   - ${err}`));
            }
        } else {
            console.log('\n❌ Sincronização falhou');
            console.log('Erros:', data.stats?.errors || data.error);
        }
    } catch (error) {
        console.error('\n❌ Erro ao conectar:', error.message);
        console.log('\n💡 Dicas:');
        console.log('   1. Certifique-se de que o servidor está rodando');
        console.log('   2. Verifique a URL da Vercel');
        console.log('   3. Tente: npm run dev (e use localhost:3000)');
    }
}

async function runFeedbacks() {
    console.log('\n🔄 Atualizando feedbacks do Frame.io...');

    try {
        const response = await fetch(`${baseUrl}/api/feedbacks/update`);
        const data = await response.json();

        if (data.success) {
            console.log('✅ Feedbacks atualizados!');
            console.log(`   - URLs encontradas: ${data.stats.totalUrls}`);
            console.log(`   - URLs processadas: ${data.stats.processedUrls}`);
            console.log(`   - Comentários extraídos: ${data.stats.commentsExtracted}`);
        } else {
            console.log('❌ Erro ao atualizar feedbacks:', data.error);
        }
    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
}

async function runEvolutionCheck() {
    console.log('\n🔄 Verificando evolução dos editores...');

    try {
        const response = await fetch(`${baseUrl}/api/evolution/check`);
        const data = await response.json();

        if (data.success) {
            console.log('✅ Verificação de evolução concluída!');
            console.log(`   - Alertas gerados: ${data.alertsGenerated}`);

            if (data.alerts && data.alerts.length > 0) {
                console.log('\n📋 Alertas:');
                data.alerts.forEach(alert => {
                    const icon = alert.type === 'improvement' ? '📈' :
                                 alert.type === 'milestone' ? '🏆' :
                                 alert.type === 'streak' ? '🔥' : '⚠️';
                    console.log(`   ${icon} ${alert.message}`);
                });
            }
        } else {
            console.log('❌ Erro:', data.error);
        }
    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('       DASHBOARD AUDIOVISUAL - SINCRONIZAÇÃO MANUAL    ');
    console.log('═══════════════════════════════════════════════════════\n');

    await runSync();
    await runFeedbacks();
    await runEvolutionCheck();

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('                    CONCLUÍDO!                         ');
    console.log('═══════════════════════════════════════════════════════');
}

main();
