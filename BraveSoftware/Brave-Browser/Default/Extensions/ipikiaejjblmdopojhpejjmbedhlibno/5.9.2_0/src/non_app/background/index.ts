import { pushEvent } from '../../analytics_g'
import { initializeBackgroundStorage } from '../../background_storage_cache'

import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  connectFirestoreEmulator,
  onSnapshot,
  doc,
} from 'firebase/firestore'
import { getStorage, connectStorageEmulator } from 'firebase/storage'

console.log('Extension id: ', chrome.runtime.getURL(''))
let manifest = chrome.runtime.getManifest()

import * as Sentry from '@sentry/browser'

import { initializeSettings, getUserLicense, userIsPRO } from '../common'
import { ContentLoaderType } from '../loaders/ContentLoader'
import { Auth } from './auth'
import { Session } from '@supabase/supabase-js'
import { APP_URL, IS_PRODUCTION, SERVER_API_URL } from '../constants'

import { trpcClient } from './api'
import { TRPCClientError } from '@trpc/client'
import { ImportSource, ImportType } from '@swiftread/server/src/import/types'
import { isFeatureEnabled } from '../../feature_flags'
import { UrlType, getUrlType, importContent } from 'app/util/client-helpers'

// version_name in manifest should only be set in prod build, so sentry will only initialize in prod build
if (manifest.version_name) {
  Sentry.init({
    dsn: 'https://d3073b94b3fc4016be99a150f304263e@o1133756.ingest.sentry.io/4503942946095104',

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,

    // set the release to track in sentry
    release: manifest.version_name ?? 'dev',

    // to add the dataCallback as beforeSend from the typescript source map docs: https://docs.sentry.io/clients/node/typescript/
    beforeSend(event) {
      var stacktrace =
        event.exception &&
        event.exception.values &&
        event.exception.values[0].stacktrace

      if (stacktrace && stacktrace.frames) {
        // console.log('stacktrace.frames: ', stacktrace.frames);
        stacktrace.frames.forEach(function (frame) {
          // console.log(frame);

          // input frame filename is something like: chrome-extension://abc123/dist/background.js
          // want to rename it to /background.js
          // because in sentry, the sourcemaps are uploaded as ~/background.js
          const filePathTokens = frame.filename
            ? frame.filename.split('/')
            : undefined
          if (filePathTokens) {
            const fileName = filePathTokens[filePathTokens.length - 1]

            frame.filename = 'app:///' + fileName
          }
        })
      }

      return event
    },
  })
}

const isProduction = IS_PRODUCTION

let firebaseApp = initializeApp({
  apiKey: 'AIzaSyCc9UtV_eOVOGEak-hTImETXHlczjp_D70',
  authDomain: 'spreed-9532e.firebaseapp.com',
  databaseURL: 'https://spreed-9532e.firebaseio.com',
  projectId: 'spreed-9532e',
  storageBucket: 'spreed-9532e.appspot.com',
  messagingSenderId: '120403148976',
  appId: '1:120403148976:web:b7eedd8197342ceb6efb75',
})

let db = getFirestore(firebaseApp)
// @ts-ignore
if (isProduction === false) {
  connectFirestoreEmulator(db, 'localhost', 8080)
}

let storage = getStorage(firebaseApp)
// @ts-ignore
if (isProduction === false) {
  connectStorageEmulator(storage, 'localhost', 9199)
}

// listen for storage changes
chrome.storage.onChanged.addListener(function (changes, namespace) {
  for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
    // const logMessages = [];
    // logMessages.push(`Storage key "${key}" in namespace "${namespace}" changed.`);
    // // log message
    // if (typeof (oldValue) === 'string' && oldValue.length > 10) {
    //     logMessages.push(`Old value was string with length ${oldValue.length}`);
    // }
    // else {
    //     logMessages.push(`Old value was "${oldValue}"`);
    // }

    // if (typeof (newValue) === 'string' && newValue.length > 10) {
    //     logMessages.push(`New value was string with length ${newValue.length}`);
    // }
    // else {
    //     logMessages.push(`New value was "${newValue}"`);
    // }
    // console.log(logMessages);

    // handle certain storage keys changing
    switch (key) {
      default:
        // console.log('Unhandled storage key change for key: ', key);
        break
    }
  }
})

// initialize auth
const auth = new Auth()

// on install
chrome.runtime.onInstalled.addListener(function (object) {
  if (chrome.runtime.OnInstalledReason.INSTALL === object.reason) {
    // installed for first time
    chrome.tabs.create({ url: 'start.html' })
  } else if (chrome.runtime.OnInstalledReason.UPDATE === object.reason) {
  }
})

// on uninstall
chrome.runtime.setUninstallURL('https://swiftread.com/uninstalled')

// logic to get currently active tab in browser
chrome.tabs.onActivated.addListener(async function (activeInfo) {
  const activeTabId = activeInfo.tabId
  const backgroundStorage = await initializeBackgroundStorage()
  await backgroundStorage.setSetting(
    backgroundStorage.ACTIVE_TAB_ID,
    activeTabId
  )
})

export interface PageMetadata {
  title: string | undefined
  url: string | undefined
  domain: string | undefined
}

interface ActiveTab extends chrome.tabs.Tab {
  id: number // redefine id to be non-nullable
  url: string // redefine url to be non-nullable
}

function getActiveTab(callback: Function) {
  chrome.tabs.query(
    { currentWindow: true, active: true },
    async function (tabs) {
      if (chrome.runtime.lastError) {
        throw chrome.runtime.lastError.message
      }

      var tab = tabs[0]
      // console.log('getting active tab:', tab);
      if (typeof tab.url !== 'undefined' && typeof tab.id !== 'undefined') {
        // cast tab as an ActiveTab which has url defined
        const activeTab = tab as ActiveTab

        const backgroundStorage = await initializeBackgroundStorage()
        await backgroundStorage.setSetting(
          backgroundStorage.ACTIVE_TAB_ID,
          activeTab.id
        )

        callback(activeTab)
      } else {
        // active tab url is undefined: means user is on a chrome extension page, or tab was created before url was specified
        console.error(
          'Active tab does not have a URL or id. Stopping execution.',
          tab
        )
        pushEvent(
          'error',
          'getting-active-tab-no-url-or-id',
          `${tab.url ? true : false} - ${tab.id ? true : false}`
        )
      }
    }
  )
}

function strip(html: string, keepStyles = false) {
  let targetNodeNames = [
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'U',
    'I',
    'B',
    'P',
    'EM',
    'DEL',
    'SMALL',
    'OL',
    'UL',
    'LI',
  ]
  // console.log('initial html: ', html);

  if (keepStyles === true) {
    const anyTagR = /<\/?((\w+)\s?.*?)>/gi
    const allTagMatches = [...html.matchAll(anyTagR)]
    // console.log('allTagMatches: ', allTagMatches);

    // replace non target tags
    let newHTML = ''
    let curIndex = 0
    for (let i = 0; i < allTagMatches.length; i++) {
      const curMatch = allTagMatches[i]

      // check to see that current match has an index. it will always have an index because the regex is global
      if (typeof curMatch.index !== 'number') {
        continue
      }
      // console.log('curMatch: ', curMatch);
      const curTag = curMatch[2]
      const curTagContent = curMatch[1]

      // add any text preceding the tag
      if (curMatch.index > curIndex) {
        newHTML += html.slice(curIndex, curMatch.index)
        // console.log('newHTML after adding text preceding tag: ', newHTML);
      }
      // add the tag
      const newTag = curMatch[0].replace(
        curTagContent,
        targetNodeNames.includes(curTag.toUpperCase()) ? curTag : 'span'
      )
      newHTML += newTag
      // console.log('newHTML after adding new tag: ', newHTML);
      curIndex = curMatch.index + curMatch[0].length
    }
    // add any text after last tag, if any
    if (curIndex < html.length) {
      newHTML += html.slice(curIndex, html.length)
    }

    // remove the span tags
    newHTML = newHTML.replaceAll('<span>', '')
    newHTML = newHTML.replaceAll('</span>', '')

    // console.log('new html: ', newHTML);

    return newHTML
  } else {
    // shortcut: get the "inner HTML"
    var tmp = document.createElement('DIV')
    tmp.innerHTML = html
    // any < > to be rendered should ber replaced with the html code already

    let finalContent = tmp.textContent || tmp.innerText || ''
    // make sure to replace any < > with the html code
    finalContent = finalContent.replace(/\</g, '&lt;')
    finalContent = finalContent.replace(/\>/g, '&gt;')

    // console.log('finalContent with all tags stripped: ', finalContent);

    return finalContent
  }
}

function openNewReader() {
  setupPopupWindow(async function (
    readerWindow: chrome.windows.Window | undefined
  ) {
    const backgroundStorage = await initializeBackgroundStorage()
    await backgroundStorage.setSetting(
      backgroundStorage.READER_WINDOW_ID,
      readerWindow ? readerWindow.id : undefined
    )
    console.log(
      'opened new reader window with id: ',
      readerWindow ? readerWindow.id : undefined
    )
  })
}
async function openOrRefreshReader() {
  // console.log('open or refresh reader called');
  const backgroundStorage = await initializeBackgroundStorage()

  // console.log('existing readerWindowId: ', storageCache.readerWindowId);
  // checks storage to see if a reader window is already open
  const readerWindowId = await backgroundStorage.getSettingFromStorage(
    backgroundStorage.READER_WINDOW_ID
  )
  if (typeof readerWindowId === 'number') {
    // there's already a readerWindowId, see if it's open
    chrome.windows.get(readerWindowId, function (window) {
      if (chrome.runtime.lastError || window === undefined) {
        // window does not exist anymore
        openNewReader()
      } else {
        // a reader window already exists, tell it to refresh with the latest selectedText
        console.log(
          'reader window already opened with id, sending message to refresh: ',
          readerWindowId,
          window
        )
        chrome.runtime.sendMessage(
          { action: 'reloadReader' },
          function (response) {
            // bring the window to focus
            chrome.windows.update(readerWindowId, {
              focused: true,
            })
          }
        )
      }
    })

    // TODO: tell reader window to refresh
  } else {
    // if not, open a new reader window
    openNewReader()
  }
}

async function preAutoExtractContent(tab: ActiveTab) {
  await setMetadataFromTab(tab)
}

let executeScriptsForKindle = function (tab: ActiveTab) {
  // extract text from amazon kindle cloud reader
  // console.log('executing kindle content extractor...');
  executeScriptsForKindleTabId(tab.id)
}
let executeScriptsForKindleTabId = async function (tabId: number) {
  pushEvent('content-extractor', 'run-kindle-cloud')
  console.log('---running kindle cloud reader scripts---')
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['jquery.js'],
  })
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/settings_store.js'],
  })
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/analytics_m.js'],
  })
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['dist/non_app/content_builders/kindle_cr/index.js'],
  })
}

let executeScriptsForGdocs = function (tab: ActiveTab) {
  executeScriptsForGdocsTabId(tab.id)
}
let executeScriptsForGdocsTabId = async function (tabId: number) {
  // console.log('injecting gdcos scripts into:',tabId);
  pushEvent('content-extractor', 'run-google-doc')
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['jquery.js'],
  })
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/settings_store.js'],
  })
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['dist/non_app/content_builders/google_docs/index.js'],
  })
}

let executeScriptsForChatGPT = async function (tab: ActiveTab) {
  const tabId = tab.id
  pushEvent('content-extractor', 'run-chat-gpt')
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['dist/non_app/content_builders/chat_gpt/index.js'],
  })
}
async function handleAutoExtractContent(
  tab: ActiveTab,
  domain: string,
  pollDomain?: string
) {
  const backgroundStorage = await initializeBackgroundStorage()
  console.log('attempting to auto extract content:')
  console.log('tab:', tab)
  console.log('domain:', domain)
  console.log('pollDomain:', pollDomain)

  const urlString = tab.url
  const urlType = await getUrlType(urlString)

  // first, check specialized extractors run as content scripts
  // check if on kindle cloud reader
  if (urlType === UrlType.KindleCloudReader) {
    await preAutoExtractContent(tab)

    // user must be on PRO
    if ((await userIsPRO()) === true) {
      console.log('on amazon cloud reader...')
      executeScriptsForKindle(tab)
    } else {
      // if user is a free user, do redirect Pro purchase page for kindle cloud reader
      await attemptRedirectToPaid(
        'kindle_cloud_extract',
        tab.url + ', ' + tab.title
      )
    }
  } else if (urlType === UrlType.GoogleDocs) {
    // reset selected text
    await preAutoExtractContent(tab)
    if ((await userIsPRO()) === true) {
      executeScriptsForGdocs(tab)
    } else {
      await attemptRedirectToPaid(
        'google_docs_extract',
        tab.url + ', ' + tab.title
      )
    }
  } else if (urlType === UrlType.ChatGPT) {
    await preAutoExtractContent(tab)
    executeScriptsForChatGPT(tab)
  }

  // then, check if in a specialized file reader
  else if (urlType === UrlType.PdfReader) {
    // send message to auto-extract from PDF
    // console.log("Auto-extract from menu, sending message to PDF...");
    chrome.runtime.sendMessage(
      { action: 'openReader', sourceType: 'pdf' },
      function (response) {}
    )
  } else if (urlType === UrlType.EpubReader) {
    // send message to auto-extract from ePub
    chrome.runtime.sendMessage(
      { action: 'openReader', sourceType: 'epub' },
      function (response) {}
    )
  }
  // otherwise, it's some other page like a website
  else {
    if (typeof pollDomain === 'undefined') {
      // reset selected text
      await preAutoExtractContent(tab)

      pushEvent('content-extractor', 'run-misc')
      console.log('executing jquery then extractor scripts...')

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['jquery.js'],
        })
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/readability.js'],
        })
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['extractor.js'],
        })

        if (tab && tab.url.includes('swiftread.com/reading-speed-test')) {
          console.log('SwiftRead executed on reading speed test')
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['src/content-script-swiftread.js'],
          })
        }
      } catch (err) {
        console.error(`failed to execute scripts for auto-extraction: ${err}`)
      }
    }
  }
}

async function setMetadataFromTab(tab: ActiveTab) {
  const backgroundStorage = await initializeBackgroundStorage()

  // save tab id
  const tabId = tab.id
  await backgroundStorage.setSetting(backgroundStorage.CURRENT_TAB_ID, tabId)

  let urlString = tab.url
  let title
  let url: URL
  let domain

  title = tab.title
  await backgroundStorage.setSetting(backgroundStorage.CURRENT_TITLE, title)

  url = new URL(urlString)
  await backgroundStorage.setSetting(
    backgroundStorage.CURRENT_URL,
    url.toString()
  )

  domain = url.hostname
  await backgroundStorage.setSetting(backgroundStorage.CURRENT_DOMAIN, domain)

  if (!url) {
    const errorMessage = 'Active tab was supposed to have URL but does not.'
    console.error(errorMessage)
    pushEvent('error', 'null-url-in-autoExtractContent', JSON.stringify(tab))
    throw new Error(errorMessage)
  }

  console.log(
    'Set current page metadata from active tab:',
    urlString,
    domain,
    title,
    tabId
  )

  return {
    url,
    domain,
    title,
    tabId,
  }
}
async function autoExtractContent(pollDomain?: string, tabId?: number) {
  let url = null
  let domain: string
  console.log('---autoExtractContent---')
  if (typeof tabId === 'undefined') {
    getActiveTab(async function (tab: ActiveTab) {
      console.log('get active tab in auto extract content:', tab)
      // active tab might not have a url (like if it's the extensions page)
      try {
        const { url: tabUrl, domain: tabDomain } = await setMetadataFromTab(tab)
        url = tabUrl
        domain = tabDomain
      } catch (err) {
        console.error(err)
        console.error(tab)
        pushEvent(
          'error',
          'error-in-active-tab-autoExtractContent',
          JSON.stringify(err)
        )
      }
      handleAutoExtractContent(tab, domain, pollDomain)
    })
  } else {
    // TODO: make sure user has tabs permission enabled at this point
    console.log('get specific tab in auto extract content:', tabId)
    chrome.tabs.get(tabId, async function (tab) {
      // if there was a chrome API error
      if (chrome.runtime.lastError) {
        var errorMsg = chrome.runtime.lastError.message
        pushEvent(
          'error',
          'could-not-get-specific-tabId-in-autoExtractContent',
          errorMsg
        )
        return
      }
      if (tab.url === undefined) {
        pushEvent(
          'error',
          'null-tab-url-in-autoExtractContent',
          JSON.stringify(tab)
        )
        return
      }

      const activeTab = tab as ActiveTab
      try {
        const { url: tabUrl, domain: tabDomain } = await setMetadataFromTab(
          activeTab
        )
        url = tabUrl
        domain = tabDomain
      } catch (err) {
        console.error(err)
        console.error(activeTab)
        pushEvent(
          'error',
          'error-in-specific-tab-autoExtractContent',
          JSON.stringify(err)
        )
      }
      // console.log('tab-specific auto extract:', url, domain, tab);
      handleAutoExtractContent(activeTab, domain, pollDomain)
    })
  }
}

async function autoExtractContentAndOpenReader() {
  console.log('auto extract called')
  await autoExtractContent()
}

// event tracking
// use pushEvent from analytics.js

// redirect
async function attemptRedirectToPaid(
  settingKey: string,
  eventData: string | null = null
) {
  pushEvent('in-app-upgrade-redirect', settingKey, eventData)
  const storageCache = await initializeBackgroundStorage()
  const openedProWindowId = await storageCache.getSettingFromStorage(
    storageCache.OPENED_PRO_WINDOW_ID
  )
  const openedProTabId = await storageCache.getSettingFromStorage(
    storageCache.OPENED_PRO_TAB_ID
  )
  // console.log("openedProWindowId:", openedProWindowId);
  // console.log("openedProTabId:", openedProTabId);

  if (openedProWindowId !== null && openedProTabId !== null) {
    // try to redirect to existing pro page
    // console.log("redirecting to existing pro page");
    // focus on window of pro page
    try {
      chrome.windows.update(
        openedProWindowId,
        { focused: true },
        function (window) {
          // console.log("at window:", window);
          if (window === undefined || chrome.runtime.lastError) {
            // can't show window
            if (chrome.runtime.lastError) {
              console.error(chrome.runtime.lastError.message)
            }

            redirectToPaid(settingKey)
          } else {
            // focus on tab of pro page
            chrome.tabs.update(
              openedProTabId,
              { active: true },
              function (tab) {
                // console.log("at tab:", tab);
                if (tab === undefined || chrome.runtime.lastError) {
                  // can't show tab, maybe because it was closed already
                  if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message)
                  }

                  redirectToPaid(settingKey)
                }
              }
            )
          }
        }
      )
    } catch (e) {
      console.warn(e)
      redirectToPaid(settingKey)
    }
  } else {
    // open new pro page
    console.log('redirecting to new pro page')
    redirectToPaid(settingKey)
  }
}
function redirectToPaid(featureName: string) {
  chrome.tabs.create(
    {
      url:
        'https://swiftread.com/pro?utm_source=extension&utm_medium=internal&utm_campaign=pro_feature_' +
        featureName,
    },
    async function (tab) {
      // focus the window that the new tab is in
      chrome.windows.update(tab.windowId, { focused: true })

      // track that we've redirected once already
      const storageCache = await initializeBackgroundStorage()
      await storageCache.setSetting(
        storageCache.OPENED_PRO_WINDOW_ID,
        tab.windowId
      )
      await storageCache.setSetting(storageCache.OPENED_PRO_TAB_ID, tab.id)
    }
  )
}

// open window on hotkey listener
// TEXT SELECTION HOTKEY
/* The function that finds and returns the selected text */
const getHighlightedText = () => {
  var selection = window.getSelection()
  return selection !== null && selection.rangeCount > 0
    ? selection.toString()
    : ''
}
const checkFrames = () => {
  return
}
const checkInjectIntoAllFrames = async (tab: ActiveTab): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    chrome.scripting
      .executeScript({
        func: checkFrames,
        target: { tabId: tab.id, allFrames: true },
      })
      .then((result) => {
        resolve(true)
      })
      .catch((err) => {
        resolve(false)
      })
    // if 500ms has passed, resolve false
    setTimeout(() => {
      resolve(false)
    }, 200)
  })
}

chrome.commands.onCommand.addListener(async function (cmd) {
  const backgroundStorage = await initializeBackgroundStorage()

  if (cmd === 'open-spreed') {
    getActiveTab(async function (tab: ActiveTab) {
      // only execute on web pages, and exclude non-web custom reader pages
      const urlType = getUrlType(tab.url)
      if (urlType === UrlType.PdfReader) {
        console.log(
          'SwiftRead not run. Page like PDF reader detected, which should have its own command listener.'
        )
      } else if (urlType === UrlType.EpubReader) {
        console.log(
          'SwiftRead not run. Page like ePub reader detected, which should have its own command listener.'
        )
      } else {
        console.log('Open spreed hotkey pressed...')

        /* Inject the code into all frames of the active tab */
        // there could be a really large number of frames.
        // check injecting a dummy script into all frames first, to see if it's possible
        console.log('check injecting into all frames first...')

        try {
          const toInjectInAllFrames = await checkInjectIntoAllFrames(tab)
          const selectedTextPerFrame = await chrome.scripting.executeScript({
            func: getHighlightedText,
            target: { tabId: tab.id, allFrames: toInjectInAllFrames }, //  <-- inject into all frames, as the selection might be in an iframe, not the main page
          })
          console.log('selectedTextPerFrame: ', selectedTextPerFrame)

          if (selectedTextPerFrame && selectedTextPerFrame.length > 0) {
            const firstFrameSelectedText = selectedTextPerFrame[0].result

            if (
              typeof firstFrameSelectedText === 'string' &&
              firstFrameSelectedText.length > 0
            ) {
              /* The results are as expected */
              // console.log('Selected text: ' + selectedTextPerFrame[0]);

              await backgroundStorage.setSetting(backgroundStorage.OPEN_MODE, 3)
              await backgroundStorage.setSetting(
                backgroundStorage.KEEP_RAW,
                true
              )
              await backgroundStorage.setSetting(
                backgroundStorage.SELECTED_TEXT,
                firstFrameSelectedText
              )

              // set metadata with active tab
              await setMetadataFromTab(tab)

              openOrRefreshReader()
            } else {
              // nothing selected, we want to auto content extract
              await backgroundStorage.setSetting(backgroundStorage.OPEN_MODE, 1)
              await autoExtractContentAndOpenReader()
            }
          } else {
            // likely because of some error above that prevented spreed from recognizing that there's either no or some selected text
          }
        } catch (e) {
          /* Report any error */
          // this should only happen if user tries to read a chrome extension page (internal or external)
          console.error(e)
          console.error(
            'WARNING: SwiftRead not run. Try selecting text, right-clicking, then clicking "SwiftRead selected text". '
          )
        }
      }
    })
  } else if (cmd === 'save-to-app') {
    if (!isFeatureEnabled('save-to-app')) {
      return
    }

    await backgroundStorage.setSetting(backgroundStorage.OPEN_MODE, 13)

    // set setting value to save content to app on next reader open
    await backgroundStorage.setSetting(
      backgroundStorage.SAVE_TO_APP_ON_READER_OPEN,
      true
    )
    // extract and open reader
    await autoExtractContentAndOpenReader()
  }
})

//////
//
// MESSAGE LISTENERS
//
//////

async function extractorFunction(
  html: string,
  keepRaw: boolean,
  source: string
) {
  console.log('BG: extracted html received char length:', html.length)

  const backgroundStorage = await initializeBackgroundStorage()

  // if told to keep raw
  if (keepRaw && keepRaw === true) {
    await backgroundStorage.setSetting(backgroundStorage.KEEP_RAW, true)
    await backgroundStorage.setSetting(backgroundStorage.SELECTED_TEXT, html)
  } else {
    // otherwise, keep the style tags (e.g. for a website), strip other HTML tags
    let htmlStripped = strip(html, true)

    // console.log('htmlStripped:',htmlStripped);

    await backgroundStorage.setSetting(backgroundStorage.KEEP_RAW, false)
    await backgroundStorage.setSetting(
      backgroundStorage.SELECTED_TEXT,
      htmlStripped
    )
  }

  if (source && source === 'kindle-cloud-reader') {
    // logging for kindle cloud reader
    console.log(
      'Extracted text received from Kindle Cloud Reader, num characters:',
      html.length
    )
  }
}
interface ServerLog {
  name: string
  payload: string | undefined
}
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  // console.log(
  //   "message received from " + sender.tab
  //     ? `from a content script at: ${sender.tab?.url} with id: ${sender.tab?.id}`
  //     : "from the extension"
  // );
  // console.log("message:", request);

  // chrome extensions api promise workaround: https://stackoverflow.com/questions/53024819/chrome-extension-sendresponse-not-waiting-for-async-function
  ;(async () => {
    const settingsStore = await initializeSettings()
    const backgroundStorage = await initializeBackgroundStorage()

    if (request.action == 'openSpreedWithPasted') {
      await backgroundStorage.setSetting(backgroundStorage.OPEN_MODE, 6)
      await backgroundStorage.setSetting(backgroundStorage.KEEP_RAW, true)
      await backgroundStorage.setSetting(
        backgroundStorage.SELECTED_TEXT,
        request.pastedText
      )

      await backgroundStorage.removeSetting(backgroundStorage.CURRENT_DOMAIN)
      await backgroundStorage.removeSetting(backgroundStorage.CURRENT_URL)
      await backgroundStorage.removeSetting(backgroundStorage.CURRENT_TITLE)

      await openOrRefreshReader()

      sendResponse({
        success: true,
      })
    } else if (request.action == 'extractor') {
      //the end point for all auto content extractor calls
      await extractorFunction(request.html, request.keepRaw, request.source)

      sendResponse({
        success: true,
      })
    } else if (request.action == 'openSpreedFromMenu') {
      console.log('Open reader from browser menu event received')
      await backgroundStorage.setSetting(backgroundStorage.OPEN_MODE, 8)
      await autoExtractContentAndOpenReader()

      sendResponse({
        success: true,
      })
    } else if (request.action == 'autoExtractContent') {
      let pollDomain
      if (request.hasOwnProperty('pollDomain') === true) {
        pollDomain = request.pollDomain
      }
      let tabId
      if (request.hasOwnProperty('tabId') === true) {
        tabId = request.tabId
      }
      await autoExtractContent(pollDomain, tabId)
      sendResponse({
        success: true,
      })
    } else if (request.action == 'getWPMSpeed') {
      const wpm = await settingsStore.getSettingFromStorage(
        settingsStore.SETTING_WPM
      )
      const chunkSize = await settingsStore.getSettingFromStorage(
        settingsStore.SETTING_CHUNK_SIZE
      )

      sendResponse({
        wpm: wpm,
        chunkSize: chunkSize,
      })
    } else if (request.action == 'getCurrentTab') {
      sendResponse({
        success: true,
        tab: sender.tab,
      })
    } else if (request.action == 'userIsPRO') {
      const isPRO = await userIsPRO()
      sendResponse({
        success: true,
        isPRO: isPRO,
      })
    } else if (request.action == 'getUserLicense') {
      const licenseKey = await getUserLicense()
      sendResponse({
        success: true,
        licenseKey: licenseKey,
      })
    } else if (request.action == 'redirectToPaid') {
      // console.log("redirect to paid event received:", request);
      await attemptRedirectToPaid(request.featureName)
      sendResponse({
        success: true,
      })
    } else if (request.action == 'pushEvent') {
      // TODO: add option to sent event to GA and/or another source
      // console.log('background received pushEvent:',request);
      let label = null
      let value = null
      if (request.hasOwnProperty('eventLabel') === true) {
        label = request.eventLabel
      }
      if (request.hasOwnProperty('eventValue') === true) {
        value = request.eventValue
      }

      pushEvent(request.eventCategory, request.eventAction, label, value)

      sendResponse({
        success: true,
      })
    } else if (request.action == 'openReader') {
      console.log('OpenReader event received:', request)
      await openOrRefreshReader()
      sendResponse({
        success: true,
      })
    } else if (request.action == 'setVarsForPageTurn') {
      console.log('setVarsForPageTurn request:', request)

      if (request.hasOwnProperty('currentDomain') && request.currentDomain) {
        await backgroundStorage.setSetting(
          backgroundStorage.CURRENT_DOMAIN,
          request.currentDomain
        )
        await backgroundStorage.setSetting(
          backgroundStorage.CURRENT_URL,
          request.currentDomain
        )
      } else if (
        request.hasOwnProperty('currentDomain') &&
        !request.currentDomain
      ) {
        await backgroundStorage.removeSetting(backgroundStorage.CURRENT_DOMAIN)
        await backgroundStorage.removeSetting(backgroundStorage.CURRENT_URL)
      }

      if (request.hasOwnProperty('currentTabId') && request.currentTabId) {
        await backgroundStorage.setSetting(
          backgroundStorage.CURRENT_TAB_ID,
          request.currentTabId
        )
      } else if (
        request.hasOwnProperty('currentTabId') &&
        !request.currentTabId
      ) {
        await backgroundStorage.removeSetting(backgroundStorage.CURRENT_TAB_ID)
      }

      sendResponse({
        success: true,
      })
    } else if (request.action == 'storeLocationString') {
      await backgroundStorage.setSetting(
        backgroundStorage.LOCATION_STRING,
        request.locationString
      )
      sendResponse({
        success: true,
      })
    } else if (request.action == 'gdocsPageTurn') {
      if (request.direction === 'left')
        chrome.scripting.executeScript({
          target: { tabId: request.tabId },
          files: ['src/pageTurnDirection_left.js'],
        })
      else if (request.direction === 'right')
        chrome.scripting.executeScript({
          target: { tabId: request.tabId },
          files: ['src/pageTurnDirection_right.js'],
        })
      executeScriptsForGdocsTabId(request.tabId)
      sendResponse({
        success: true,
      })
    } else if (request.action == 'kindlePageTurn') {
      if (request.direction === 'left') {
        chrome.scripting.executeScript({
          target: { tabId: request.tabId },
          files: ['src/pageTurnDirection_left.js'],
        })
      } else if (request.direction === 'right') {
        chrome.scripting.executeScript({
          target: { tabId: request.tabId },
          files: ['src/pageTurnDirection_right.js'],
        })
      }
      executeScriptsForKindleTabId(request.tabId)
      sendResponse({
        success: true,
      })
    } else if (request.action === 'openWithFirebaseDocument') {
      console.log('openWithFirebaseDocument called:', request)
      // open swiftread with content from firebase document
      try {
        // watch firebase document for the updated document field
        let unsubscribe = onSnapshot(
          doc(db, request.collection, request.id),
          async (doc) => {
            const data = doc.data()
            if (!data) {
              console.error(
                `Firebase document ${request.collection}, ${request.id} does not exist`
              )
              // clear any loading indicators
              if (
                request.source === ContentLoaderType.KindleCloudReader &&
                request.tabId
              ) {
                chrome.tabs.sendMessage(request.tabId, {
                  action: 'clearLoadingIndicator',
                })
              }
            } else {
              if (data.hasOwnProperty(request.field)) {
                console.log(
                  `${request.collection}, document ${request.id}, updated for field '${request.field}', sending content...`
                )

                // determine if we should reload an existing swiftread window or open a new one
                const reload = request.reload ?? false

                // open swiftread with the extracted content
                const content = data[request.field]
                // store extracted text in local storage
                if (request.source === ContentLoaderType.KindleCloudReader) {
                  await extractorFunction(content, true, 'kindle-cloud-reader')

                  // // DEBUG: DO NOT KEEP IN PROD
                  // if (reload === true) {
                  //   await extractorFunction("", true, 'kindle-cloud-reader');
                  // } else {
                  //   await extractorFunction(content, true, 'kindle-cloud-reader');
                  // }
                } else {
                  console.error(
                    `Extracting for ${request.source} not implemented for openWithFirebaseDocument`
                  )
                  // clear any loading indicators
                  if (
                    request.source === ContentLoaderType.KindleCloudReader &&
                    request.tabId
                  ) {
                    chrome.tabs.sendMessage(request.tabId, {
                      action: 'clearLoadingIndicator',
                    })
                  }
                  return
                }

                // open or reload existing swiftread window
                if (reload === false) {
                  // open swiftread window
                  // if extracted content in document is empty, show error message
                  if (content === '') {
                    // clear any loading indicators
                    if (
                      request.source === ContentLoaderType.KindleCloudReader &&
                      request.tabId
                    ) {
                      chrome.tabs.sendMessage(request.tabId, {
                        action: 'clearLoadingIndicator',
                      })
                    }
                    console.error(
                      'No next detected on this page. Please turn to a page with text then try again.\n\nIf you think this is an error, email help@swiftread.com'
                    )
                    return
                  }
                  console.log('opening new swiftread window...')
                  await openOrRefreshReader()
                } else {
                  // send message to open swiftread window to reload
                  console.log('reloading existing swiftread window...')
                  chrome.runtime.sendMessage(
                    { action: 'reloadReader' },
                    function (response) {}
                  )
                }

                // clear any loading indicators
                if (
                  request.source === ContentLoaderType.KindleCloudReader &&
                  request.tabId
                ) {
                  chrome.tabs.sendMessage(request.tabId, {
                    action: 'clearLoadingIndicator',
                  })
                }

                // unsubscribe from snapshot
                unsubscribe()

                sendResponse({
                  success: true,
                })
              } else {
                // console.log(`${request.collection}, document ${request.id}, updated but not for field '${request.field}'`);
              }
            }
          }
        )

        // unsubscribe from snapshot if we're still waiting for a document, after a delay
        let unsubscribeSnapshot = setTimeout(() => {
          unsubscribe()
          sendResponse({
            success: false,
          })
          clearTimeout(unsubscribeSnapshot)
        }, 15000)
      } catch (err) {
        // some error waiting for firebase document
        console.error(err)
        // show user the error
        // TODO: somehow do this from the background
        pushEvent(
          'error',
          'open-with-firebase-document',
          request.source + ', ' + err
        )
        sendResponse({
          success: false,
        })
      }
    } else if (request.action === 'localStorageWithFirebaseDocument') {
      console.log('localStorageWithFirebaseDocument called:')
      try {
        // watch firebase document for the updated document field
        let unsubscribe = onSnapshot(
          doc(db, request.collection, request.id),
          async (doc) => {
            const data = doc.data()
            // console.log("firebase document data: ", data);
            if (!data) {
              console.error(
                `Firebase document ${request.collection}, ${request.id} does not exist`
              )
            } else {
              if (data.hasOwnProperty(request.field)) {
                console.log(
                  `${request.collection}, document ${request.id}, updated for field '${request.field}', sending content...`
                )

                const content = data[request.field]

                // store extracted text in the input local storage variable name
                const backgroundStorage = await initializeBackgroundStorage()
                backgroundStorage.setSetting(
                  request.localStorageVarName,
                  content
                )

                console.log(
                  `${content.length} characters stored in chrome local storage ${request.localStorageVarName} `
                )

                // unsubscribe from snapshot
                unsubscribe()
                sendResponse({
                  success: true,
                })
              } else {
                // console.log(`${request.collection}, document ${request.id}, updated but not for field '${request.field}'`);
              }
            }
          }
        )

        // unsubscribe from snapshot after a delay
        let unsubscribeSnapshot = setTimeout(() => {
          unsubscribe()
          sendResponse({
            success: false,
          })
          clearTimeout(unsubscribeSnapshot)
        }, 15000)
      } catch (err) {
        // some error waiting for firebase document
        console.error(
          'Error in when opening Firebase document. Report to help@swiftread.com.\n' +
            request.source +
            ', ' +
            err
        )
        // TODO: somehow show this error to user too
        pushEvent(
          'error',
          'localStorage-with-firebase-document',
          request.source + ', ' + err
        )
        sendResponse({
          success: false,
        })
      }
    } else if (request.action === 'logToServer') {
      // construct log object
      const logObj: ServerLog = {
        name: request.name,
        payload: undefined,
      }
      if (request.hasOwnProperty('payload')) {
        logObj.payload = JSON.stringify(request.payload)
      }
      // send log to server
      const response = await fetch(`${SERVER_API_URL}log`, {
        method: 'POST',
        body: JSON.stringify(logObj),
        headers: {
          'Content-Type': 'application/json',
        },
      })
      const jsonResponse = await response.json()
      if (response.status !== 200) {
        console.error(jsonResponse)
      } else {
        // log response was successful
        sendResponse(jsonResponse)
      }
    } else if (request.action === 'getListenAudio') {
      const listenResponse = request.listenResponse
      // watch firebase document for listen audio

      try {
        // watch firebase document for the updated document field

        let unsubscribe = onSnapshot(
          doc(db, listenResponse.collection, listenResponse.id),
          async (doc) => {
            // console.log('snapshot for doc updated: ');

            const data = doc.data()
            if (!data)
              throw `Listen ${listenResponse.id} exists but does not have any data`
            else if (
              data.hasOwnProperty('audioUrl') &&
              data.hasOwnProperty('timepointsUrl')
            ) {
              console.log(
                `Listen ${listenResponse.id} has both audioUrl and timepointsUrl now, sending...`
              )

              const audioDownloadUrl = data['audioDownloadUrl']
              const timepointsDownloadUrl = data['timepointsDownloadUrl']

              // console.log('audio and timepoints download urls: ', audioDownloadUrl, timepointsDownloadUrl);

              // if either audio or timepoints download url is undefined, force update the audio listen object
              if (
                typeof audioDownloadUrl === 'undefined' ||
                typeof timepointsDownloadUrl === 'undefined'
              ) {
                chrome.runtime.sendMessage(
                  {
                    action: 'forceUpdateAudio',
                    listenId: listenResponse.id,
                    wordIndex: request.wordIndex,
                    spreedTabId: request.spreedTabId,
                  },
                  function (response) {
                    sendResponse({
                      success: false,
                    })
                  }
                )
              } else {
                let timepoints
                console.log('fetching timepoints url...') // fetch directly from firebase storage
                const response = await fetch(timepointsDownloadUrl)
                // console.log('timepoints response: ', response);

                if (response.status === 200) {
                  console.log('response successful, getting json response...')

                  const jsonResponse = await response.json()

                  // response was successful
                  timepoints = jsonResponse
                  // console.log('timepoints: ', timepoints);

                  if (timepoints && Object.keys(timepoints).length === 0) {
                    console.log(
                      `timepoints retrieved but empty for listen ${listenResponse.id}.force updating...`
                    )
                    // send force update request
                    chrome.runtime.sendMessage(
                      {
                        action: 'forceUpdateAudio',
                        listenId: listenResponse.id,
                        wordIndex: request.wordIndex,
                        spreedTabId: request.spreedTabId,
                      },
                      function (response) {
                        sendResponse({
                          success: false,
                        })
                      }
                    )
                  }
                  console.log('sending message to return audio and timepoints')
                  chrome.runtime.sendMessage(
                    {
                      action: 'returnListenAudio',
                      audioUrl: audioDownloadUrl,
                      timepointsUrl: timepointsDownloadUrl,
                      timepoints,
                      wordIndex: request.wordIndex,
                      spreedTabId: request.spreedTabId,
                    },
                    function (response) {}
                  )
                } else if (response.status === 404) {
                  // send force update request
                  console.log(
                    `timepoints do not exsit at timepoints url for ${listenResponse.id}.force updating...`
                  )
                  chrome.runtime.sendMessage(
                    {
                      action: 'forceUpdateAudio',
                      listenId: listenResponse.id,
                      wordIndex: request.wordIndex,
                      spreedTabId: request.spreedTabId,
                    },
                    function (response) {
                      sendResponse({
                        success: false,
                      })
                    }
                  )
                } else {
                  console.error(
                    `Error in fetch timepoints, attempting to force update... `,
                    response
                  )
                  chrome.runtime.sendMessage(
                    {
                      action: 'forceUpdateAudio',
                      listenId: listenResponse.id,
                      wordIndex: request.wordIndex,
                      spreedTabId: request.spreedTabId,
                    },
                    function (response) {
                      sendResponse({
                        success: false,
                      })
                    }
                  )
                }

                // unsubscribe from snapshot
                unsubscribe()

                sendResponse({
                  success: true,
                })
              }
            } else {
              console.log(
                `Listen ${listenResponse.id} does not have both audioUrl and timepointsUrl yet...`
              )
            }
          }
        )

        // unsubscribe from snapshot after a delay (if we're still waiting)
        let unsubscribeSnapshot = setTimeout(() => {
          unsubscribe()

          sendResponse({
            success: false,
          })

          clearTimeout(unsubscribeSnapshot)
        }, 15000)
      } catch (err) {
        // TODO: this does not catch thrown fetch timepoints response?
        // some error waiting for firebase document
        const error =
          'Error in when getting audio data. Report to help@swiftread.com.\n response: ' +
          JSON.stringify(request.listenResponse) +
          ', ' +
          err
        console.error(error)
        pushEvent(
          'error',
          'getListenAudio',
          JSON.stringify(request.listenResponse) + ', ' + err
        )
        sendResponse({
          success: false,
        })

        // TODO: somehow report error to user and log in sentry
      }
    } else if (request.action === 'gotPageSource') {
      // console.log("gotPageSource message detected");
      // console.log(request);
      // forward request to content script in sender tab id
      if (sender.tab && sender.tab.id) {
        chrome.tabs.sendMessage(sender.tab.id, request, function (response) {
          sendResponse({
            success: true,
          })
        })
      } else {
        console.warn(
          'ignoring storedPageSource message because sender tab is undefined'
        )
        sendResponse({
          success: false,
        })
      }
    } else if (request.action === 'getCommand') {
      // console.log("getCommand message detected");
      const defaultCommandHTMLStrings: { [key: string]: string } = {
        'open-spreed': '&#8997;V',
        'save-toa--': '&#8997;X',
      }

      const commandId = request.commandId
      const commands = await chrome.commands.getAll()
      const commandNames = commands.filter(
        (command) => command.name === commandId
      )
      if (commandNames.length > 0) {
        const command = commandNames[0]
        sendResponse({
          success: true,
          hasCommand: true,
          commandHTMLString: command.shortcut,
        })
      } else {
        // otherwise, return the default open command key
        sendResponse({
          success: true,
          hasCommand: false,
          commandHTMLString: defaultCommandHTMLStrings[commandId],
        })
      }
    } else if (request.action == 'setMetadata') {
      if (request.hasOwnProperty('metadata') && request.metadata) {
        const metadata = request.metadata as PageMetadata
        if (metadata.title) {
          await backgroundStorage.setSetting(
            backgroundStorage.CURRENT_TITLE,
            metadata.title
          )
        }

        if (metadata.url) {
          await backgroundStorage.setSetting(
            backgroundStorage.CURRENT_URL,
            metadata.url
          )
        }

        if (metadata.domain) {
          await backgroundStorage.setSetting(
            backgroundStorage.CURRENT_DOMAIN,
            metadata.domain
          )
        }

        console.log('Set metadata event received:', metadata)

        sendResponse({
          success: true,
        })
      } else {
        sendResponse({
          success: false,
        })
      }
    } else if (request.action === 'authAppUser') {
      if (!isFeatureEnabled('save-to-app')) {
        sendResponse({
          success: false,
          error: 'Feature not enabled',
        })
        return
      }

      try {
        // // TODO: remove this debug action to log out user before every sign in
        // try {
        //   await auth.signOut()
        // } catch (e) {
        //   // there was some error on sign out, ignore so that we can try authing the user from scratch
        //   console.warn(e)
        // }

        const windowId: number | undefined = request.windowId
        // check if user is already signed in from the auth store
        let session: Session | null = null
        try {
          session = await auth.session()
        } catch (e) {
          // there was some error trying to get the session (likely access token expired), ignore so that we can try authing the user from scratch
          console.warn(e)
        }
        // if not, create a new tab with the sign in url (force sign out first, and tell it to show the close message)
        if (session === null) {
          console.log('No session found, redirecting to sign in page...')
          const signInFlowComplete = await auth.signInToApp()
          if (!signInFlowComplete) {
            throw new Error(
              'Sign in was not completed in time. Please try again.'
            )
          }
          // bring source window id back into focus
          if (windowId) {
            chrome.windows.update(windowId, { focused: true })
          }
          try {
            session = await auth.session()
          } catch (e) {
            // there was some error trying to get the session (likely access token expired), ignore because a potentially null session can be passed back
            console.warn(e)
          }
        }
        console.log('Session found? ', typeof session !== 'undefined')
        sendResponse({
          success: true,
          session,
        })
      } catch (error) {
        console.error('Error authing user to app:', error)
        sendResponse({
          success: false,
          error:
            'While authing user to app: ' + (error as any).message ?? error,
        })
      }
    } else if (request.action === 'saveToApp') {
      if (!isFeatureEnabled('save-to-app')) {
        sendResponse({
          success: false,
          error: 'Feature not enabled',
        })
        return
      }

      console.log('saveToApp action detected')

      // set setting value to save content to app on next reader open
      const backgroundStorage = await initializeBackgroundStorage()
      await backgroundStorage.setSetting(
        backgroundStorage.SAVE_TO_APP_ON_READER_OPEN,
        true
      )
      // extract and open reader
      await backgroundStorage.setSetting(backgroundStorage.OPEN_MODE, 12)
      await autoExtractContentAndOpenReader()

      sendResponse({
        success: true,
      })
    } else if (request.action === 'importToApp') {
      if (!isFeatureEnabled('save-to-app')) {
        sendResponse({
          success: false,
          error: 'Feature not enabled',
        })
        return
      }

      const data: string | undefined = request.data
      const importType = 'html' // currently all imports from the extension are considered "HTML"
      const url: string | undefined = request.url
      const title: string | undefined = request.title

      try {
        if (!data) {
          throw new Error('No data provided to importToApp')
        }

        console.log('importToApp action detected')

        // make sure user is signed in
        let session = await auth.session()
        if (!session) {
          throw new Error('Please sign in to save content to the app.')
        }
        console.log('Session found, continuing...')

        // upload data to storage
        const contentId = await importContent(trpcClient, auth, data, {
          source: ImportSource.EXTENSION,
          importType: ImportType.HTML,
          url,
          title,
        })

        sendResponse({
          success: true,
          contentId,
        })
      } catch (error) {
        console.error('Error importing content to app:', error)
        sendResponse({
          success: false,
          error: (error as any).message ?? error,
        })
      }
    } else if (request.action === 'saveToAppAllowed') {
      function saveToAppAllowed(url: string): boolean {
        const urlType = getUrlType(url)
        if (urlType === UrlType.KindleCloudReader) {
          return false
        }
        return true
      }
      if (request.hasOwnProperty('url')) {
        sendResponse({
          success: true,
          allowed: saveToAppAllowed(request.url),
        })
      } else {
        getActiveTab(async function (tab: ActiveTab) {
          sendResponse({
            success: true,
            allowed: saveToAppAllowed(tab.url),
          })
        })
      }
    } else if (request.action === 'getConstants') {
      sendResponse({
        success: true,
        APP_URL,
      })
    } else if (request.action === 'isFeatureEnabled') {
      const featureId = request.featureId
      const result = isFeatureEnabled(featureId)
      console.log(`Feature ${featureId} enabled? ${result}`)
      sendResponse({
        success: true,
        result,
      })
    }
  })()

  return true
})

// CONTEXT MENU
async function openSpreedWithSelection(obj: chrome.contextMenus.OnClickData) {
  //works
  const isPRO = await userIsPRO()

  getActiveTab(async function (tab: ActiveTab) {
    console.log('open with selection for tab:', tab)

    const urlType = getUrlType(tab.url)

    // if on pdf.js page and is not a pro user, redirect to payment page
    if (tab.url && urlType === UrlType.PdfReader && !isPRO) {
      console.log(
        'Right-click SwiftRead run on PDF reader, user not on PRO. Redirecting.'
      )
      await attemptRedirectToPaid('pdf_reader')
    }
    // if in epub reader and is not pro, redirect to payment page
    else if (tab.url && urlType === UrlType.EpubReader && !isPRO) {
      console.log(
        'Right-click SwiftRead run on ePub reader, user not on PRO. Redirecting.'
      )
      await attemptRedirectToPaid('epub_reader')
    } else {
      const backgroundStorage = await initializeBackgroundStorage()
      // console.log('Right-click selected text: ' + obj.selectionText);

      await backgroundStorage.setSetting(backgroundStorage.OPEN_MODE, 4)
      await backgroundStorage.setSetting(backgroundStorage.KEEP_RAW, true)
      await backgroundStorage.setSetting(
        backgroundStorage.SELECTED_TEXT,
        obj.selectionText
      )

      // set metadata with active tab
      await setMetadataFromTab(tab)

      await openOrRefreshReader()
    }
  })
}

async function setupPopupWindow(callback?: Function) {
  // console.log('setting up pop up window');

  // get currently active chrome tab's window
  const tab = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  })
  if (!tab || tab.length === 0) {
    console.error('No active tab found')
    return
  }
  const curTab = tab[0]

  // console.log("setting up popup window with tab: ", curTab);
  const parentWindow = await chrome.windows.get(curTab.windowId)

  const backgroundStorage = await initializeBackgroundStorage()

  // get the reader window's previous (or default) width and height
  const width = await backgroundStorage.getSettingFromStorage(
    backgroundStorage.READER_WINDOW_WIDTH
  )
  const height = await backgroundStorage.getSettingFromStorage(
    backgroundStorage.READER_WINDOW_HEIGHT
  )

  // get the reader window's previous (or default) x and y position
  // console.log('parentWindow left and top: ', parentWindow.left, parentWindow.top)
  const x =
    (await backgroundStorage.getSettingFromStorage(
      backgroundStorage.READER_WINDOW_X
    )) ??
    parentWindow.left ??
    0
  const y =
    (await backgroundStorage.getSettingFromStorage(
      backgroundStorage.READER_WINDOW_Y
    )) ??
    parentWindow.top ??
    0

  console.log('Opening reader with width, height, x, y: ', width, height, x, y)
  popupwindow('app.html', '', width, height, x, y, callback)
}
async function popupwindow(
  url: string,
  title: string,
  w: number,
  h: number,
  x: number,
  y: number,
  callback?: Function
) {
  const openedWindow = await chrome.windows
    .create({
      url: url,
      width: Math.round(w),
      height: Math.round(h),
      top: y,
      left: x,
      type: 'popup',
    })
    .catch(async (err) => {
      // if there was some error creating this window (e.g. position out of bounds), just reset the window position
      console.warn(err)
      console.log(
        'Resetting SwiftRead window dimensions and trying to open again...'
      )

      const backgroundStorage = await initializeBackgroundStorage()

      await backgroundStorage.removeSetting(
        backgroundStorage.READER_WINDOW_WIDTH
      )
      await backgroundStorage.removeSetting(
        backgroundStorage.READER_WINDOW_HEIGHT
      )
      await backgroundStorage.removeSetting(backgroundStorage.READER_WINDOW_X)
      await backgroundStorage.removeSetting(backgroundStorage.READER_WINDOW_Y)

      setupPopupWindow(callback)
    })

  if (callback) callback(openedWindow)
}

// Create page menu
const pageMenuId = 'swiftread'
chrome.contextMenus.remove(pageMenuId, function () {
  if (chrome.runtime.lastError) {
    console.log(`Context menu item "${pageMenuId}" not found, creating new one`)
  }
  chrome.contextMenus.create({
    id: pageMenuId,
    title: 'SwiftRead this page',
  })
})

// Create selection menu
const selectedMenuId = 'swiftread-selected'
var contexts: chrome.contextMenus.ContextType[] = ['selection']
for (var i = 0; i < contexts.length; i++) {
  var context = contexts[i]
  var title = 'SwiftRead selected text'
  chrome.contextMenus.remove(selectedMenuId, function () {
    if (chrome.runtime.lastError) {
      console.log(
        `Context menu item "${selectedMenuId}" not found, creating new one`
      )
    }
    const id = chrome.contextMenus.create({
      id: selectedMenuId,
      title: title,
      contexts: [context],
    })
    //console.log("'" + context + "' item:" + id);
  })
}
function handleContextMenuClick(info: chrome.contextMenus.OnClickData) {
  if (info.menuItemId === selectedMenuId) {
    openSpreedWithSelection(info)
  } else {
    // run the following in an async context
    ;(async () => {
      const backgroundStorage = await initializeBackgroundStorage()
      await backgroundStorage.setSetting(backgroundStorage.OPEN_MODE, 11)
      await autoExtractContentAndOpenReader()
    })()
  }
}
chrome.contextMenus.onClicked.addListener(handleContextMenuClick)

// PDF handling
// file handling
if (chrome.fileBrowserHandler) {
  chrome.fileBrowserHandler.onExecute.addListener((id, details) => {
    if (id === 'open-as-pdf') {
      const entries = details.entries
      for (const entry of entries) {
        chrome.tabs.create({
          url: chrome.runtime.getURL(
            '/data/pdf.js/web/viewer.html?file=' +
              encodeURIComponent(entry.toURL())
          ),
        })
      }
    }
  })
}
