export default defineEventHandler((event) => {
  const user = event.context.user
  return { accepted: Boolean(user?.legalConsentVersion), version: user?.legalConsentVersion || null }
})
