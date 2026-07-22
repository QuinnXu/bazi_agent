import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  REFERRAL_ATTRIBUTION_DAYS,
  REFERRAL_REWARD_APPLES,
  REFERRAL_REWARD_EXPIRY_DAYS,
} from '@/lib/referral-attribution'
import { normalizeReferralCode } from '@/lib/rewards'
import { shouldActivateReferralFromUsage } from '@/lib/token-usage'

assert.equal(REFERRAL_REWARD_APPLES, 30)
assert.equal(REFERRAL_REWARD_EXPIRY_DAYS, 365)
assert.equal(REFERRAL_ATTRIBUTION_DAYS, 30)
assert.equal(normalizeReferralCode(' bb-12_ab '), 'BB12AB')

assert.equal(shouldActivateReferralFromUsage({ source: 'classic_chat', task: 'free', status: 'completed' }, 12), true)
assert.equal(shouldActivateReferralFromUsage({ source: 'feature_page', task: 'apple_report', status: 'completed' }, 120), true)
assert.equal(shouldActivateReferralFromUsage({ source: 'agent_tool', task: 'apple_report', status: 'completed' }, 120), true)
assert.equal(shouldActivateReferralFromUsage({ source: 'agent_planner', task: 'agent_planner', status: 'completed' }, 12), false)
assert.equal(shouldActivateReferralFromUsage({ source: 'agent_tool', task: 'follow_up_suggestions', status: 'completed' }, 12), false)
assert.equal(shouldActivateReferralFromUsage({ source: 'classic_chat', task: 'free', status: 'empty' }, 12), false)
assert.equal(shouldActivateReferralFromUsage({ source: 'classic_chat', task: 'free', status: 'completed' }, 0), false)

async function main() {
  const migration = await readFile(
    resolve(process.cwd(), 'supabase/migrations/202607200001_referral_growth_v2.sql'),
    'utf8',
  )
  for (const required of [
    "reward_policy_version = 'apple_v2'",
    "'referral:' || referral_row.id::TEXT || ':invitee'",
    "'referral:' || referral_row.id::TEXT || ':referrer'",
    'CREATE OR REPLACE FUNCTION public.activate_referral_reward',
    'REVOKE EXECUTE ON FUNCTION public.activate_referral_reward(UUID) FROM PUBLIC, anon, authenticated',
  ]) {
    assert(migration.includes(required), `migration must include: ${required}`)
  }

  console.log('Referral V2 smoke passed: policy, activation eligibility, and idempotency keys verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
