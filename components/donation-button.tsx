"use client"

export { MembershipDialog as DonationDialog } from "@/components/membership-plans"

// Keep the old DonationButton export for backward compatibility,
// but it's now unused since page.tsx manages the dialog state directly.
export function DonationButton() {
  return null
}
