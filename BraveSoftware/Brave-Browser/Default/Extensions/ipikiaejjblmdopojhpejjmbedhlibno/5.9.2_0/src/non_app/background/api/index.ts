import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@swiftread/server/src/trpc'
import { APP_API_URL } from '../../constants'
import { Auth } from '../auth'
const auth = new Auth()

export const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${APP_API_URL}/trpc`,
      headers: getHeaders('extension'),
    }),
  ],
})

function getHeaders(trpcSource: string) {
  return async function headers() {
    const headers = new Map<string, string>()
    headers.set('x-trpc-source', trpcSource)

    const session = (await auth.client.auth.getSession()).data.session

    // Manually add the auth name as the backend uses cookies to authenticate users
    // This allows mobile to authenticate via Supabase
    if (session?.access_token) {
      headers.set('Authorization', `Bearer ${session.access_token}`)
      headers.set('Refresh-Token', `${session.refresh_token}`) // required cause of Supabase's setSession()
    }
    return Object.fromEntries(headers)
  }
}
