import { NextRequest, NextResponse } from 'next/server';
import { autopostGeneric, type PipelineStage } from '@/lib/rrg/autopost';

export const dynamic = 'force-dynamic';

const VALID_STAGES: PipelineStage[] = ['AWARENESS', 'CONSIDERATION', 'DECISION', 'ACTION'];

// POST /api/rrg/agent-post
// Pipeline-aware posting endpoint for Priscilla and other agents.
// Auth: ADMIN_SECRET via header or body.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { content, pipeline_stage, content_type, target_channels, image_url, discord_channel_id } = body;

    const secret = body.secret ?? req.headers.get('x-admin-secret');
    if (secret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'content (string) is required' }, { status: 400 });
    }
    if (!pipeline_stage || !VALID_STAGES.includes(pipeline_stage)) {
      return NextResponse.json(
        { error: `pipeline_stage must be one of: ${VALID_STAGES.join(', ')}` },
        { status: 400 },
      );
    }

    const result = await autopostGeneric({
      content,
      pipeline: {
        pipeline_stage,
        content_type: content_type ?? 'generic',
        target_channels: Array.isArray(target_channels) ? target_channels : undefined,
      },
      imageUrl: image_url ?? null,
      discord_channel_id: discord_channel_id ?? undefined,
    });

    return NextResponse.json({
      success: result.errors.length === 0,
      channels: result.channels,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (err) {
    console.error('[/api/rrg/agent-post]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
