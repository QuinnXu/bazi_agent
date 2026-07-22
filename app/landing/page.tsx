import { redirect } from "next/navigation"

import { GUEST_FIRST_QA_FLOW } from "@/lib/guest-first-qa-flow"

type SearchParamValue = string | string[] | undefined

interface LandingRedirectPageProps {
  searchParams?: Promise<Record<string, SearchParamValue>>
}

function firstSearchParam(value: SearchParamValue): string {
  return Array.isArray(value) ? value[0] || "" : value || ""
}

export default async function LandingRedirectPage({
  searchParams,
}: LandingRedirectPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const params = new URLSearchParams({
    from: "landing",
    trialFlow: GUEST_FIRST_QA_FLOW.id,
  })
  const prompt = firstSearchParam(resolvedSearchParams.prompt).trim()

  if (prompt) {
    params.set("prompt", prompt)
  }

  redirect(`/?${params.toString()}`)
}
