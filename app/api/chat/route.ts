// Runtime configuration for Vercel
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: Request) {
  try {
    console.log('Chat API called');
    const { messages, baziAnalysisResult } = await req.json();
    console.log('Messages received:', messages);
    console.log('Bazi analysis result received:', baziAnalysisResult);

    // Build system prompt with potential Bazi context
    let systemPrompt = "你是一个友好、专业的AI助手，可以用中文和英文与用户交流。";
    
    if (baziAnalysisResult) {
      systemPrompt += `\n\n你还是一位精通八字命理的专业命理师。用户的八字信息如下：\n${baziAnalysisResult}\n\n请根据用户的问题，结合八字命理知识为用户提供专业、准确的分析和建议。`;
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
        model: 'deepseek-reasoner',
        messages: messagesWithSystem,
        temperature: 0.7,
        max_tokens: 4000,
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
        let buffer = '';
        let isInThinking = false;
        let thinkingContent = '';

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
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

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
                  let content = parsed.choices?.[0]?.delta?.content || '';
                  
                  if (content) {
                    // Process thinking tags for deepseek-reasoner
                    let processedContent = '';
                    let tempContent = content;
                    
                    while (tempContent.length > 0) {
                      if (isInThinking) {
                        const thinkingEndIndex = tempContent.indexOf('</thinking>');
                        if (thinkingEndIndex !== -1) {
                          thinkingContent += tempContent.substring(0, thinkingEndIndex);
                          isInThinking = false;
                          tempContent = tempContent.substring(thinkingEndIndex + '</thinking>'.length);
                          // Don't send thinking content to frontend
                        } else {
                          thinkingContent += tempContent;
                          tempContent = '';
                        }
                      } else {
                        const thinkingStartIndex = tempContent.indexOf('<thinking>');
                        if (thinkingStartIndex !== -1) {
                          processedContent += tempContent.substring(0, thinkingStartIndex);
                          isInThinking = true;
                          thinkingContent = '';
                          tempContent = tempContent.substring(thinkingStartIndex + '<thinking>'.length);
                        } else {
                          processedContent += tempContent;
                          tempContent = '';
                        }
                      }
                    }
                    
                    // Only send non-thinking content
                    if (processedContent) {
                      controller.enqueue(new TextEncoder().encode(processedContent));
                    }
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