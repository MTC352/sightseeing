import { redirect } from "next/navigation"

// Default Settings landing → first tab.
export default function SettingsIndex() {
  redirect("/admin/settings/trips")
}
