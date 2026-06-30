import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database_v2'
import type {
  LiuYaoContextPayload,
  LiuYaoStoredMessage,
} from '@/lib/liuyao/types'

const CHAT_SESSION_SELECT =
  'id, user_id, bazi_profile_id, title, summary, mode, message_count, status, created_at, updated_at, last_message_at'

export async function getOwnedLiuYaoSession(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select(CHAT_SESSION_SELECT)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()

  if (error || !data || data.mode !== 'liuyao') return null
  return data
}

export async function loadLiuYaoContext(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<LiuYaoContextPayload | null> {
  const { data, error } = await supabase
    .from('chat_session_contexts')
    .select('payload')
    .eq('session_id', sessionId)
    .eq('context_type', 'liuyao_hexagram')
    .maybeSingle()

  if (error) throw error
  return data?.payload as unknown as LiuYaoContextPayload | null
}

export async function loadLiuYaoMessages(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<LiuYaoStoredMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, metadata, created_at')
    .eq('session_id', sessionId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data || []).map(message => ({
    ...message,
    mode: 'liuyao',
    model: null,
    tokens_used: null,
  })) as unknown as LiuYaoStoredMessage[]
}

export function createPersistedTextStream(
  upstream: ReadableStream,
  onComplete: (content: string) => Promise<void>,
): ReadableStream {
  const decoder = new TextDecoder()
  let output = ''

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value?.length) output += decoder.decode(value, { stream: true })
          controller.enqueue(value)
        }
        output += decoder.decode()
        if (output.trim()) await onComplete(output)
        controller.close()
      } catch (error) {
        try {
          controller.error(error)
        } catch {
          // Stream may already be closed by the client.
        }
      }
    },
  })
}
