// Runtime configuration for Vercel
export const runtime = 'nodejs'
export const maxDuration = 10

import { analyzeBazi } from '@/tool/tool/paipan';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { year, month, day, hour, isSolar, isFemale, longitude, latitude } = body;

    // Validate required fields
    if (!year || !month || !day || !hour) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: year, month, day, hour' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Call the Bazi analysis function
    const result = analyzeBazi(
      year,
      month,
      day,
      hour,
      isSolar !== undefined ? isSolar : true,
      isFemale !== undefined ? isFemale : false,
      false, // is_leap is not used in the current implementation
      longitude !== undefined ? longitude : 121.5, // Default to Shanghai
      latitude !== undefined ? latitude : 31.2   // Default to Shanghai
    );

    // Log the Bazi analysis results
    console.log('Bazi Analysis Results:', JSON.stringify(result, null, 2));

    return new Response(
      JSON.stringify({ baziResult: result }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in Bazi API:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}