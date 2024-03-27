const isProduction = true
// TODO: DO NOT ENABLE IN PROD, there's definitely a better way of doing this...
// const isProduction = false;

let SERVER_API_URL
let FIREBASE_FUNCTIONS_URL
if (isProduction === true) {
  SERVER_API_URL = 'https://swiftread-ext-api.herokuapp.com/api/'
  FIREBASE_FUNCTIONS_URL =
    'https://us-central1-spreed-9532e.cloudfunctions.net/'
} else {
  // DEBUG: local server API URL DO NOT LEAVE IN PROD
  SERVER_API_URL = 'http://localhost:8081/api/'
  FIREBASE_FUNCTIONS_URL = 'http://localhost:5001/spreed-9532e/us-central1/'
}
if (FIREBASE_FUNCTIONS_URL.includes('localhost')) {
  console.error('API url is localhost. Remember to change.')
}

let homepageUrl = chrome.runtime.getManifest().homepage_url

spreedThis = function (e) {
  e.preventDefault()
  pushEvent('spreed menu item', 'spreed current page')

  chrome.runtime.sendMessage(
    { action: 'openSpreedFromMenu' },
    function (response) {
      window.close()
    }
  )
}

spreedPasted = function (e) {
  e.preventDefault()

  pushEvent('spreed menu item', 'open paste window')

  chrome.tabs.create({ url: 'spreedPaste.html' })
}

showStatistics = function (e) {
  e.preventDefault()
  pushEvent('spreed menu item', 'open stats window')

  setTimeout(function () {
    chrome.tabs.create({
      url: 'statistics.html?utm_source=extension_menu&utm_medium=internal&utm_campaign=statistics_menu_item',
    })
  }, 200)
}

showHowtouse = function (e) {
  e.preventDefault()
  pushEvent('spreed menu item', 'open how to use')
  setTimeout(function () {
    chrome.tabs.create({ url: 'https://swiftread.com/i/welcome' })
  }, 200)
}

showDonate = function (e) {
  e.preventDefault()
  pushEvent('spreed menu item', 'click-donate')
  setTimeout(function () {
    chrome.tabs.create({
      url: 'https://www.paypal.com/donate?hosted_button_id=S76JFJWDVUEPQ',
    })
  }, 200)
}

showWriteReview = function (e) {
  e.preventDefault()
  pushEvent('spreed menu item', 'click-write-review')
  setTimeout(function () {
    chrome.tabs.create({ url: homepageUrl }, function (tab) {
      chrome.windows.update(tab.windowId, { focused: true })
      pushEvent('spreed menu item', 'open write review')
    })
  }, 200)
}

showKindleCloud = function (e) {
  e.preventDefault()
  pushEvent('spreed menu item', 'click-kindle-cloud')
  setTimeout(function () {
    chrome.tabs.create(
      { url: 'https://swiftread.com/i/kindle-instructions' },
      function (tab) {
        pushEvent('spreed menu item', 'open kindle cloud')
      }
    )
  }, 200)
}

showPdf = async function (e) {
  e.preventDefault()
  pushEvent('spreed menu item', 'click-pdf')
  setTimeout(async function () {
    chrome.tabs.create({
      url: '/src/pdf.js/web/viewer.html',
    })
  }, 200)
}

showePub = async function (e) {
  e.preventDefault()
  pushEvent('spreed menu item', 'click-epub')
  setTimeout(async function () {
    chrome.tabs.create({
      url: '/pages/epub_reader.html',
    })
  }, 200)
}
showGoogleDocs = function (e) {
  e.preventDefault()
  pushEvent('spreed menu item', 'click-google-docs')
  setTimeout(function () {
    chrome.tabs.create(
      { url: 'pages/google_docs_instructions.html' },
      function (tab) {
        pushEvent('spreed menu item', 'open google docs')
      }
    )
  }, 200)
}

showEnterProLicense = function (e) {
  e.preventDefault()
  pushEvent('spreed menu item', 'enter-pro-license')

  setTimeout(function () {
    chrome.tabs.create(
      { url: 'pages/enter_pro_license_key.html' },
      function (tab) {
        pushEvent('spreed menu item', 'open pro license key page')
      }
    )
  }, 200)
}

showAbout = function (e) {
  e.preventDefault()
  pushEvent('spreed menu item', 'about')
  setTimeout(function () {
    chrome.tabs.create({ url: 'https://swiftread.com/about' }, function (tab) {
      chrome.windows.update(tab.windowId, { focused: true })
    })
  }, 200)
}

showTest = function (e) {
  e.preventDefault()
  pushEvent('spreed menu item', 'test reading speed and comprehension')

  setTimeout(function () {
    chrome.tabs.create(
      { url: 'https://swiftread.com/reading-speed-test' },
      function (tab) {
        chrome.windows.update(tab.windowId, { focused: true })
      }
    )
  }, 200)
}

saveToApp = function (e) {
  e.preventDefault()
  pushEvent('spreed menu item', 'save to app')

  setTimeout(function () {
    chrome.runtime.sendMessage({ action: 'saveToApp' }, function (response) {
      window.close()
    })
  }, 200)
}

// settings
var state = {
  settingsStore: null,
}
async function getUserLicense() {
  return state.settingsStore.getSettingFromStorage(
    state.settingsStore.USER_LICENSE_KEY
  )
}
function getDefaultUserFeatures() {
  return state.settingsStore.getDefaultSettings()[
    state.settingsStore.USER_SETTINGS_JSON_KEY
  ]
}
async function getUserFeatures() {
  return state.settingsStore.getSettingFromStorage(
    state.settingsStore.USER_SETTINGS_JSON_KEY
  )
}
async function userIsPRO() {
  const userFeatures = await getUserFeatures()
  const defaultUserFeatures = getDefaultUserFeatures()
  const userLicense = await getUserLicense()
  // console.log('userFeatures:', userFeatures)
  // console.log('defaultUserFeatures:', defaultUserFeatures)
  // console.log('userLicense:', userLicense)

  return (
    JSON.stringify(userFeatures).length !==
      JSON.stringify(defaultUserFeatures).length && userLicense !== null
  )
}

async function populateLicenseInfo() {
  const licenseKey = await getUserLicense()
  // query the firebase function getLicenseData with license_key parameter set to licenseKey
  let licenseInfoHTML = ''
  $.ajax({
    url: `${FIREBASE_FUNCTIONS_URL}getLicenseData?license_key=${encodeURIComponent(
      licenseKey
    )}`,
    timeout: 5000,
  })
    .done(function (data) {
      // console.log('getCustomerFeatures data:', data);

      if (data.exists === true) {
        if (data.price_type === 'one_time') {
          $('#menu-license-info').hide()
        } else {
          if (data.customer_portal_url !== null) {
            licenseInfoHTML = `<a href="${data.customer_portal_url.redirect}" id="manage-subscription-link"><i class="fas fa-user-cog"></i>&nbsp;Manage subscription</a>`
            $('#menu-license-info').html(licenseInfoHTML)
            $('#manage-subscription-link').on('click', (e) => {
              e.preventDefault()
              pushEvent('spreed menu item', 'manage subscription')

              setTimeout(function () {
                chrome.tabs.create(
                  { url: data.customer_portal_url.redirect },
                  function (tab) {
                    chrome.windows.update(tab.windowId, { focused: true })
                  }
                )
              }, 200)
            })
          } else {
            $('#menu-license-info').hide()
          }
        }
      } else {
        // license key doesn't exist
        $('#menu-license-info').hide()
      }
    })
    .fail(function (error) {
      console.error(
        'Error communicating with server to get license info. Try again later.'
      )
      console.error(error.status, error.statusText)
    })
}

async function checkFeatureIsEnabled(featureId) {
  const response = await chrome.runtime.sendMessage({
    action: 'isFeatureEnabled',
    featureId,
  })
  return response.result
}
async function handleMenuFeatureFlags() {
  // hide save to app button if feature is not enabled
  const saveToAppEnabled = await checkFeatureIsEnabled('save-to-app')
  if (!saveToAppEnabled) {
    $('#menu-link-save-item').css('display', 'none')
  }
}

async function saveToAppAllowed() {
  const response = await chrome.runtime.sendMessage({
    action: 'saveToAppAllowed',
  })
  return response.allowed
}

var settingsStore = new SettingsStore()
settingsStore.isInitialized.then(function () {
  state.settingsStore = settingsStore

  // ON DOCUMENT READY
  $(document).ready(function () {
    handleMenuFeatureFlags()

    // get if user is pro
    userIsPRO().then((isPRO) => {
      if (isPRO === true) {
        $('#menu-link-enter-pro-license').hide()
        $('#menu-license-info').show()
        populateLicenseInfo()
      } else {
        // if not, show enter license key menu item
        $('#menu-link-enter-pro-license').click(showEnterProLicense)
        $('#menu-license-info').hide()
      }
    })

    //add click listeners
    $('#menu-link-spreedthis').click(spreedThis)
    $('#menu-link-spreedpasted').click(spreedPasted)
    $('#menu-link-test').click(showTest)
    $('#menu-link-statistics').click(showStatistics)
    $('#menu-link-howtouse').click(showHowtouse)
    // $('#menu-link-donate').click(showDonate);
    $('#menu-link-kindle-cloud').click(showKindleCloud)
    $('#menu-link-pdf').click(showPdf)
    $('#menu-link-epub').click(showePub)
    $('#menu-link-google-docs').click(showGoogleDocs)
    $('#menu-link-write-review').click(showWriteReview)
    $('#menu-about').click(showAbout)

    // check if save to app is allowed
    saveToAppAllowed().then((allowed) => {
      if (allowed) {
        $('#menu-link-save').show()
        $('#menu-link-save').click(saveToApp)
      } else {
        $('#menu-link-save').hide()
      }
    })

    // get command hotkeys
    const commandIds = ['open-spreed', 'save-to-app']
    commandIds.forEach((commandId) => {
      chrome.runtime.sendMessage(
        { action: 'getCommand', commandId: commandId },
        function (response) {
          $(`#${commandId}-hotkey`).html(response.commandHTMLString)
        }
      )
    })
  })
})
