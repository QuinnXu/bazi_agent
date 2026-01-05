// Runtime configuration for Vercel
export const runtime = 'nodejs'
export const maxDuration = 300

// Helper function to get current date string
function getCurrentDateString(): string {
  const now = new Date()
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
}

// Helper function to build system prompt
function buildSystemPrompt(baziAnalysisResult: string | null, useUltraMode: boolean): string {
  let systemPrompt = "你是'卜卜象'，一个精通八字命理又善解人意积极乐观的温柔可爱小象。请主要用盲派八字的理论，结合旺衰、子平等分析并答复用户的咨询。";
  
  if (baziAnalysisResult) {
    systemPrompt += `请根据用户的诉求，先着重分析命主的性格，人生际遇或人生格局并针对成长，职业发展，人生规划，风险规避等方面做出分析和给出建议。
- 请结合不同的大运流年判断其变化的特点和需要注意的要点，同时针对特殊的大运流年组合做出专门的建议，结合格局的变化深化盲派的分析。
- 结合天干（外显或外在的表现等）与地支（内在、内心的想法、世纪情况等）分析命主在不同阶段的性格变化与矛盾冲突等，取得用户的信任但是顺从用户自身的判断。
- 请结合专列用户人生重大转折的时间节点做出提示和建议等。
- 请着重围绕用户的提问和关心的领域，根据以上方法展开相应话题的分析。
- 请在使用专业术语同时，用通俗易懂的语言结合具体情况展开解释。
- 用积极乐观的态度给予回复
- 在和多轮对话不要过分重复已经提到的内容，对话过程自然流畅，符合人设
现在是${getCurrentDateString()}

【用户八字信息】
${baziAnalysisResult}`;
  }

  return systemPrompt
}

// Helper function to call DeepSeek API
async function callDeepSeekAPI(messagesWithSystem: any[]) {
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
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('DeepSeek API Error Response:', errorText)
    throw new Error(`DeepSeek API responded with status: ${response.status}, body: ${errorText}`)
  }

  return response
}

// Helper function to call OpenRouter API (Gemini)
async function callOpenRouterAPI(messagesWithSystem: any[]) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://www.xuzheran.cc',
      'X-Title': 'BuBuXiang AI Fortune Teller',
    },
    body: JSON.stringify({
      model: 'google/gemini-3-pro-preview',
      messages: messagesWithSystem,
      temperature: 1,
      max_tokens: 16000,
      stream: true,
      // Gemini specific parameters via OpenRouter provider settings
      provider: {
        order: ['Google'],
        allow_fallbacks: false,
      },
      // Extended thinking for deeper analysis
      reasoning: {
        effort: 'high',
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('OpenRouter API Error Response:', errorText)
    throw new Error(`OpenRouter API responded with status: ${response.status}, body: ${errorText}`)
  }

  return response
}

// Helper function to process streaming response (for both APIs)
function createStreamProcessor(response: Response, isDeepSeek: boolean) {
  return new ReadableStream({
    async start(controller) {
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let isInThinking = false
      let thinkingContent = ''

      if (!reader) {
        controller.close()
        return
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) {
            controller.close()
            break
          }

          const chunk = decoder.decode(value, { stream: true })
          buffer += chunk
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.trim() === '') continue
            
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              
              if (data === '[DONE]') {
                controller.close()
                return
              }

              try {
                const parsed = JSON.parse(data)
                let content = parsed.choices?.[0]?.delta?.content || ''
                
                if (content) {
                  // Process thinking tags for deepseek-reasoner (only for DeepSeek)
                  if (isDeepSeek) {
                    let processedContent = ''
                    let tempContent = content
                    
                    while (tempContent.length > 0) {
                      if (isInThinking) {
                        const thinkingEndIndex = tempContent.indexOf('</thinking>')
                        if (thinkingEndIndex !== -1) {
                          thinkingContent += tempContent.substring(0, thinkingEndIndex)
                          isInThinking = false
                          tempContent = tempContent.substring(thinkingEndIndex + '</thinking>'.length)
                          // Don't send thinking content to frontend
                        } else {
                          thinkingContent += tempContent
                          tempContent = ''
                        }
                      } else {
                        const thinkingStartIndex = tempContent.indexOf('<thinking>')
                        if (thinkingStartIndex !== -1) {
                          processedContent += tempContent.substring(0, thinkingStartIndex)
                          isInThinking = true
                          thinkingContent = ''
                          tempContent = tempContent.substring(thinkingStartIndex + '<thinking>'.length)
                        } else {
                          processedContent += tempContent
                          tempContent = ''
                        }
                      }
                    }
                    
                    // Only send non-thinking content
                    if (processedContent) {
                      controller.enqueue(new TextEncoder().encode(processedContent))
                    }
                  } else {
                    // For Gemini, send content directly
                    controller.enqueue(new TextEncoder().encode(content))
                  }
                }
              } catch (e) {
                console.error('Error parsing streaming data:', e)
              }
            }
          }
        }
      } catch (error) {
        console.error('Error reading stream:', error)
        controller.error(error)
      }
    },
  })
}

export async function POST(req: Request) {
  try {
    const { messages, baziAnalysisResult, useUltraMode = false } = await req.json()

    // Build system prompt with dynamic date
    const systemPrompt = buildSystemPrompt(baziAnalysisResult, useUltraMode)

    // Add system message to the beginning
    const messagesWithSystem = [
      { role: 'system', content: systemPrompt },
      ...messages
    ]

    let response: Response

    if (useUltraMode) {
      console.log('Calling OpenRouter API (Gemini)...')
      response = await callOpenRouterAPI(messagesWithSystem)
    } else {
      console.log('Calling DeepSeek API...')
      response = await callDeepSeekAPI(messagesWithSystem)
    }

    // Create stream processor
    const stream = createStreamProcessor(response, !useUltraMode)

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })

  } catch (error) {
    console.error('Chat API Error:', error)
    return new Response(
      JSON.stringify({ error: 'Chat service temporarily unavailable' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
