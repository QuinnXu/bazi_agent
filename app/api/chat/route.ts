export async function POST(req: Request) {
  try {
    console.log('Chat API called');
    const { messages, baziData } = await req.json();
    console.log('Messages received:', messages);
    console.log('Bazi data received:', baziData);

    // Build system prompt with potential Bazi context
    let systemPrompt = "你是一个友好、专业的AI助手，可以用中文和英文与用户交流。";
    
    if (baziData) {
      systemPrompt += `\n\n你还是一位精通八字命理的专业命理师。用户的八字信息如下：
- 出生年份：${baziData.year}年
- 出生月份：${baziData.month}月
- 出生日期：${baziData.day}日
- 出生时辰：${baziData.hour}时
- 历法：${baziData.isSolar ? '公历' : '农历'}
- 性别：${baziData.isFemale ? '女' : '男'}
- 出生地经度：${baziData.longitude}
- 出生地纬度：${baziData.latitude}

请根据用户的问题，结合八字命理知识为用户提供专业、准确的分析和建议。`;
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
    const response = await fetch(`${process.env.DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messagesWithSystem,
        temperature: 0.7,
        max_tokens: 2000,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API Error Response:', errorText);
      throw new Error(`DeepSeek API responded with status: ${response.status}, body: ${errorText}`);
    }

    // Create a ReadableStream to handle the streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          controller.close();
          return;
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              controller.close();
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.trim() === '') continue;
              
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                
                if (data === '[DONE]') {
                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  
                  if (content) {
                    // Send the content as plain text
                    controller.enqueue(new TextEncoder().encode(content));
                  }
                } catch (e) {
                  console.error('Error parsing streaming data:', e);
                }
              }
            }
          }
        } catch (error) {
          console.error('Error reading stream:', error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
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