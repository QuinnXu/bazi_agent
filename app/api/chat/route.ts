export async function POST(req: Request) {
  try {
    console.log('Chat API called');
    const { messages, baziAnalysisResult } = await req.json();
    console.log('Messages received:', messages);
    console.log('Bazi analysis result received:', !!baziAnalysisResult);

    // Build system prompt with potential Bazi context
    let systemPrompt = "你是一个友好、专业的AI助手，可以用中文和英文与用户交流。";
    
    if (baziAnalysisResult) {
      systemPrompt += `\n\n你还是一位精通八字命理的专业命理师。用户的八字排盘结果如下：\n${baziAnalysisResult}\n\n请根据用户的问题，结合这个完整的八字排盘信息为用户提供专业、准确的命理分析和建议。`;
    }

    // Add system message to the beginning
    const messagesWithSystem = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    console.log('Calling DeepSeek API with system prompt:', systemPrompt.substring(0, 100) + '...');
    console.log('API Key exists:', !!process.env.DEEPSEEK_API_KEY);
    console.log('API Key prefix:', process.env.DEEPSEEK_API_KEY?.substring(0, 10));
    console.log('Base URL:', process.env.DEEPSEEK_BASE_URL);

    // Call DeepSeek API directly
    const requestBody = {
      model: 'deepseek-chat',
      messages: messagesWithSystem,
      temperature: 0.7,
      max_tokens: 2000,
      stream: false, // Try non-streaming first
    };
    
    console.log('Request body messages count:', requestBody.messages.length);
    console.log('First message role:', requestBody.messages[0]?.role);
    console.log('System prompt length:', requestBody.messages[0]?.content?.length || 0);
    
    const response = await fetch(`${process.env.DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API Error Response:', errorText);
      throw new Error(`DeepSeek API responded with status: ${response.status}, body: ${errorText}`);
    }

    // Handle non-streaming response
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || '';
    
    console.log('DeepSeek response received, content length:', content.length);

    return new Response(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });

  } catch (error) {
    console.error('Chat API Error:', error);
    return new Response(
      JSON.stringify({ error: 'Chat service temporarily unavailable' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}