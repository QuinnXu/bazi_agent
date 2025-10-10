// Runtime configuration for Vercel
export const runtime = 'nodejs'
export const maxDuration = 300

import { analyzeBazi } from '@/tool/tool/paipan';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    let { year, month, day, hour, isSolar, isFemale, longitude, latitude } = body;

    // 将可能的字符串数值转为数字
    year = year !== undefined ? Number(year) : undefined;
    month = month !== undefined ? Number(month) : undefined;
    day = day !== undefined ? Number(day) : undefined;
    hour = hour !== undefined ? Number(hour) : undefined; // 允许 0 点

    // 更严格的字段验证（避免 0 被误判）
    if (
      year === undefined || month === undefined || day === undefined || hour === undefined ||
      [year, month, day, hour].some(v => Number.isNaN(v))
    ) {
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