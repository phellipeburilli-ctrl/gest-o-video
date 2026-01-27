import { NextResponse } from 'next/server';

const CLICKUP_API = 'https://api.clickup.com/api/v2';

export async function GET(req: Request) {
    const listId = process.env.CLICKUP_LIST_ID;
    const key = process.env.CLICKUP_API_KEY;

    // Get the base URL of the deployment (e.g. https://audiovisual-app.vercel.app)
    const host = req.headers.get('host');
    const protocol = host?.includes('localhost') ? 'http' : 'https';
    const webhookUrl = `${protocol}://${host}/api/webhooks/clickup`;

    if (!listId || !key) {
        return NextResponse.json({ error: 'Missing Credentials in .env' }, { status: 500 });
    }

    try {
        console.log(`[Setup] Registering webhook for List ${listId} to ${webhookUrl}`);

        const response = await fetch(`${CLICKUP_API}/list/${listId}/webhook`, {
            method: 'POST',
            headers: {
                'Authorization': key,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                endpoint: webhookUrl,
                events: ['taskStatusUpdated'],
                status: 'active'
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json({ error: data }, { status: response.status });
        }

        return NextResponse.json({
            success: true,
            message: 'Webhook Registered!',
            webhook: data
        });

    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
