const RITUAL_FEEDBACK_STORAGE_KEY = 'bubu_ritual_feedback_enabled'

let ritualAudioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null

  const AudioContextConstructor = window.AudioContext || (
    window as typeof window & { webkitAudioContext?: typeof AudioContext }
  ).webkitAudioContext
  if (!AudioContextConstructor) return null

  ritualAudioContext ||= new AudioContextConstructor()
  return ritualAudioContext
}
export function readRitualFeedbackPreference(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(RITUAL_FEEDBACK_STORAGE_KEY) === '1'
}

export function writeRitualFeedbackPreference(enabled: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(RITUAL_FEEDBACK_STORAGE_KEY, enabled ? '1' : '0')
}

export async function playRitualFeedback({
  preview = false,
}: {
  preview?: boolean
} = {}): Promise<void> {
  if (typeof document === 'undefined' || (!preview && document.hidden)) return

  const context = getAudioContext()
  if (context) {
    try {
      if (context.state === 'suspended') await context.resume()

      const now = context.currentTime
      const masterGain = context.createGain()
      masterGain.gain.setValueAtTime(0.0001, now)
      masterGain.gain.exponentialRampToValueAtTime(preview ? 0.025 : 0.032, now + 0.012)
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
      masterGain.connect(context.destination)

      const lowTone = context.createOscillator()
      lowTone.type = 'sine'
      lowTone.frequency.setValueAtTime(620, now)
      lowTone.frequency.exponentialRampToValueAtTime(720, now + 0.18)
      lowTone.connect(masterGain)

      const highTone = context.createOscillator()
      const highGain = context.createGain()
      highTone.type = 'sine'
      highTone.frequency.setValueAtTime(880, now + 0.035)
      highGain.gain.setValueAtTime(0.42, now)
      highTone.connect(highGain)
      highGain.connect(masterGain)

      lowTone.start(now)
      highTone.start(now + 0.035)
      lowTone.stop(now + 0.18)
      highTone.stop(now + 0.18)
    } catch {
      // Completion feedback is an enhancement; unsupported audio should stay silent.
    }
  }

  if (!preview && 'vibrate' in navigator) {
    try {
      navigator.vibrate(20)
    } catch {
      // Some browsers expose vibrate but reject it outside supported contexts.
    }
  }
}
