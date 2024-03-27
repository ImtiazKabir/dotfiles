// @ts-ignore
import { SettingsStore } from '../settings_store'

// settings
export async function initializeSettings() {
  var settingsStore = new SettingsStore()
  await settingsStore.isInitialized
  return settingsStore
}
export async function getUserLicense() {
  var settingsStore = await initializeSettings()
  return settingsStore.getSettingFromStorage(settingsStore.USER_LICENSE_KEY)
}
export async function getDefaultUserFeatures() {
  var settingsStore = await initializeSettings()
  const defaultSettings = settingsStore.getDefaultSettings()
  // @ts-ignore
  return defaultSettings[settingsStore.USER_SETTINGS_JSON_KEY]
}
export async function getUserFeatures() {
  var settingsStore = await initializeSettings()
  return settingsStore.getSettingFromStorage(
    settingsStore.USER_SETTINGS_JSON_KEY
  )
}
export async function userIsPRO() {
  const userFeatures = await getUserFeatures()
  const defaultUserFeatures = await getDefaultUserFeatures()
  const userLicense = await getUserLicense()
  console.log('userFeatures:', userFeatures)
  console.log('defaultUserFeatures:', defaultUserFeatures)
  console.log('userLicense:', userLicense)

  return (
    JSON.stringify(userFeatures).length !==
      JSON.stringify(defaultUserFeatures).length && userLicense !== null
  )
}

// background communication
export function getCurrentTab(): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'getCurrentTab' },
      function (response) {
        if (response.success === true) {
          resolve(response.tab)
        } else {
          reject(
            'Error setting up SwiftRead for this tab. Please close this tab, re-open it, and try again. For help, email help@swiftread.com'
          )
        }
      }
    )
  })
}

export function sendMessagePromise(messagePayload: any): Promise<boolean> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(messagePayload, function (response) {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message
        console.error(
          'Error when sending message ' + JSON.stringify(messagePayload)
        )
        console.error(errorMsg)
        reject(false)
      }

      if (
        response &&
        response.hasOwnProperty('success') &&
        response.success === true
      ) {
        resolve(true)
      } else {
        console.error(
          'Background did not respond successfully to the following message payload: ' +
            JSON.stringify(messagePayload)
        )
        reject(messagePayload)
      }
    })
  })
}

// misc
export function wait(millis: number) {
  return new Promise(function (fulfill) {
    setTimeout(fulfill, millis)
  })
}

export function getUrl(): string {
  const url = window.location.href
  return url
}

export function getDomain(): string {
  const url = getUrl()
  const domain = new URL(url).hostname
  return domain
}
