/**
 * Avatar management — presets, upload handling, and AI generation via DALL-E 3.
 */

export interface PresetAvatar {
  id: string;
  src: string;
  label: string;
}

export const PRESET_AVATARS: PresetAvatar[] = [
  { id: 'preset-01', src: '/avatars/presets/preset-01.svg', label: 'Emerald Diamond' },
  { id: 'preset-02', src: '/avatars/presets/preset-02.svg', label: 'Purple Rings' },
  { id: 'preset-03', src: '/avatars/presets/preset-03.svg', label: 'Coral Zigzag' },
  { id: 'preset-04', src: '/avatars/presets/preset-04.svg', label: 'Midnight Star' },
  { id: 'preset-05', src: '/avatars/presets/preset-05.svg', label: 'Orange Stripe' },
  { id: 'preset-06', src: '/avatars/presets/preset-06.svg', label: 'Teal Hex' },
  { id: 'preset-07', src: '/avatars/presets/preset-07.svg', label: 'Gold Spiral' },
  { id: 'preset-08', src: '/avatars/presets/preset-08.svg', label: 'Rose Triangle' },
  { id: 'preset-09', src: '/avatars/presets/preset-09.svg', label: 'Blue Wave' },
  { id: 'preset-10', src: '/avatars/presets/preset-10.svg', label: 'Forest Fern' },
  { id: 'preset-11', src: '/avatars/presets/preset-11.svg', label: 'Slate Cross' },
  { id: 'preset-12', src: '/avatars/presets/preset-12.svg', label: 'Deco Fan' },
];

const AVATAR_GENERATION_COST_USDC = 0.04;

/**
 * Generate an avatar image using DALL-E 3 based on persona data.
 * Returns a PNG buffer.
 */
export async function generateAvatar(persona: {
  name: string;
  bio?: string | null;
  voice?: string | null;
  style_tags?: string[];
}): Promise<Buffer> {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const styleHints = persona.style_tags?.length
    ? `Style influences: ${persona.style_tags.slice(0, 5).join(', ')}.`
    : '';

  const voiceHint = persona.voice ? `Personality: ${persona.voice}.` : '';
  const bioHint = persona.bio ? `Character: ${persona.bio.slice(0, 100)}.` : '';

  const prompt = `Create an abstract, artistic avatar icon for a fashion-focused AI shopping concierge named "${persona.name}". ${bioHint} ${voiceHint} ${styleHints} The design should be modern, geometric, and fashion-forward. No text, no human faces. Use bold colours on a dark background. Square format, clean edges, suitable as a profile picture at small sizes.`;

  const response = await client.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1024x1024',
    quality: 'standard',
    response_format: 'b64_json',
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image data returned from DALL-E');

  return Buffer.from(b64, 'base64');
}

export { AVATAR_GENERATION_COST_USDC };
