// Runtime configuration for Vercel
export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: Request) {
  try {
    console.log('Chat API called');
    const { messages, baziAnalysisResult } = await req.json();
    console.log('Messages received:', messages);
    console.log('Bazi analysis result received:', baziAnalysisResult);

    // Build system prompt with potential Bazi context
    let systemPrompt = "你是一个友好、专业的八字命理师，你可以亲切的与用户交流回答他们的问题。如果用户询问八字、命理、运势相关问题但未提供生辰信息，请引导用户点击下方按钮输入生辰信息提供。";
    
    if (baziAnalysisResult) {
      // systemPrompt += `\n\n你还是一位精通八字命理的专业命理师。用户的八字信息如下：\n${baziAnalysisResult}\n\n请根据用户的问题，结合八字命理知识为用户提供专业、准确的分析和建议。`;
      systemPrompt += `你是一位资深八字命理师。请主要用盲派八字的理论，结合旺衰、子平等分析并答复用户的咨询。
请根据命主的诉求，着重分析命主的性格，人生际遇或人生格局并针对成长，职业发展，人生规划，风险规避等方面做出分析。
- 请结合不同的大运流年判断其变化的特点和需要注意的要点，同时针对特殊的大运流年组合做出专门的建议，结合格局的变化深化盲派的分析。
- 结合天干（外显或外在的表现等）与地支（内在、内心的想法、世纪情况等）分析命主在不同阶段的性格变化与矛盾冲突等。
- 请结合专列人生重大转折的时间节点做出提示和建议等。
- 请着重围绕用户的提问和关心的领域，根据以上方法展开相应话题的分析。
- 请在使用专业术语同时，用通俗易懂的语言结合具体情况展开解释。
- 不要提自己是deepseek，不要提自己是deepseek，不要提自己是deepseek。
- 用积极乐观的态度给予回复
- 现在是2025乙巳年

【用户八字信息】
${baziAnalysisResult}`;
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