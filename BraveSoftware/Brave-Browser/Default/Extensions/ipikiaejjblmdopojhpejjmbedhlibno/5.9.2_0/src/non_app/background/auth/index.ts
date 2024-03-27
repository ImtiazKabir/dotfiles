import { SupabaseClient, createClient } from '@supabase/supabase-js'
import { wait } from '../../common'
import { APP_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from '../../constants'
import { Database } from '@swiftread/server/src/util/database-types'

// To fetch items from storage
export const getLocalStorage = async (key: string): Promise<any> =>
  (await chrome.storage.local.get(key))[key]

// To remove storage key from the chrome storage
export const removeLocalStorage = async (key: string): Promise<void> =>
  await chrome.storage.local.remove(key)

// For setting storage
export const setLocalStorage = async (dataObject: any): Promise<void> =>
  await chrome.storage.local.set(dataObject)

const storageAdapter = {
  getItem: async (name: string) => {
    return await getLocalStorage(name)
  },

  setItem: async (name: string, value: string) => {
    return await setLocalStorage({ [name]: value })
  },

  removeItem: async (name: string) => {
    return await removeLocalStorage(name)
  },
}

const options = {
  auth: {
    debug: false,
    persistSession: true,
    storage: storageAdapter,
  },
}

export class Auth {
  client: SupabaseClient<Database>
  signingIn: boolean = false
  signInTabId: number | null = null

  constructor() {
    this.client = createClient<Database>(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      options
    )
  }
  async session() {
    const { data, error } = await this.client.auth.getSession()
    if (error) {
      this._isNotSigningIn()
      throw error
    }
    return data.session
  }

  async setSession(accessToken: string, refreshToken: string) {
    console.log('setting session with tokens: ', accessToken, refreshToken)
    const { data, error } = await this.client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (error) {
      this._isNotSigningIn()
      throw error
    }
    console.log('setting session successful: ', data)
    return data
  }

  async signOut() {
    console.log('Signing out of app')
    const { error } = await this.client.auth.signOut()
    if (error) throw error
  }

  async signInToApp() {
    console.log('signing in to app')

    const _signInClose = async (
      tabId: number,
      removeInfo: chrome.tabs.TabRemoveInfo
    ) => {
      //   console.log("listener: tab closed: ", tabId);

      // if it was the sign in tab
      if (tabId === this.signInTabId) {
        console.log('app sign in tab was closed')
        // remove the listener
        chrome.tabs.onRemoved.removeListener(_signInClose)
        // set signingIn to false
        this._isNotSigningIn()
      }
    }

    const _signIn = async (
      changes: {
        [key: string]: chrome.storage.StorageChange
      },
      areaName: string
    ) => {
      //   console.log("storage changed: ", changes, areaName);
      // if accessToken and refreshToken are set
      if (changes.accessToken?.newValue && changes.refreshToken?.newValue) {
        console.log('got new accessToken and refreshToken')
        const { user, session } = await this.setSession(
          changes.accessToken.newValue,
          changes.refreshToken.newValue
        )

        // close the sign in tab
        console.log('attempting to close sign in tab: ', this.signInTabId)
        await wait(1000)
        if (this.signInTabId) {
          try {
            await chrome.tabs.remove(this.signInTabId)
          } catch (error) {
            console.warn('Error closing sign in tab: ', error)
          }
        }

        // remove the listener
        chrome.storage.onChanged.removeListener(_signIn)

        // set signingIn to false
        this._isNotSigningIn()
      }
    }

    // remove any old listeners if they exist
    chrome.tabs.onRemoved.removeListener(_signInClose)
    chrome.storage.onChanged.removeListener(_signIn)

    // add a close listener to reset signed in state if sign in tab is closed
    chrome.storage.onChanged.addListener(_signIn)
    chrome.tabs.onRemoved.addListener(_signInClose)

    // create a new tab with the sign in url (force sign out first, and tell it to show the close message)
    const signInTab = await chrome.tabs.create({
      url: `${APP_URL}/auth/sign-in?close=true&message=benefits`,
      active: true,
    })
    if (!signInTab.id) throw 'Could not create sign in tab'
    // focus on sign in tab window
    await chrome.windows.update(signInTab.windowId, { focused: true })
    this._isSigningIn(signInTab.id)

    return this._waitUntilSignedIn()
  }

  _isSigningIn(tabId: number) {
    console.log('signing in...')
    this.signingIn = true
    this.signInTabId = tabId
    console.log('signing in tab id: ', this.signInTabId)
  }

  _isNotSigningIn() {
    console.log('sign in ended')
    this.signingIn = false
    this.signInTabId = null
  }

  // listener to watch for access_token and refresh_token query string params

  async _waitUntilSignedIn(timeout: number = 120000) {
    if (!this.signingIn) {
      console.warn(
        'Was supposed to wait until signed in, but not currently signing in'
      )
      return false
    }

    const start = Date.now()
    while (this.signingIn) {
      if (Date.now() - start > timeout) {
        console.error('Timed out waiting for sign in')
        return false
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return true
  }
}
