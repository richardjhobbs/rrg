import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';

export const dynamic = 'force-dynamic';

/** GET /api/agent/[agentId]/recommendations — Agent's recommended drops */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  const { data, error } = await db
    .from('agent_evaluations')
    .select('*')
    .eq('agent_id', agentId)
    .eq('decision', 'recommend')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch recommendations' }, { status: 500 });
  }

  return NextResponse.json({ recommendations: data ?? [] });
}
