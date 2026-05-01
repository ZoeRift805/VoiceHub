export async function verifyTurnstileToken(token: string, secret: string) {
  const res = await $fetch<{ success: boolean; 'challenge_ts'?: string }>(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token }),
    }
  )
  if (res.success && res['challenge_ts']) {
    const challengeTime = new Date(res['challenge_ts']).getTime()
    if (Math.abs(Date.now() - challengeTime) > 5 * 60 * 1000) {
      return false
    }
  }
  return res.success
}
