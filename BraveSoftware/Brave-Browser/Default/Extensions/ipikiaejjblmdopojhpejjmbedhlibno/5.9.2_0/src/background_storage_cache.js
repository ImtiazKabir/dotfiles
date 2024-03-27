var BackgroundStorageCache = class {
  constructor() {
    // keys
    this.CURRENT_DOMAIN = 'currentDomain'
    this.CURRENT_TAB_ID = 'currentTabId' // the tab id of the last tab that swiftread was run on (could also be the PDF reader, ePub reader, etc.)
    this.SELECTED_TEXT = 'selectedText'
    this.KEEP_RAW = 'keepRaw'
    this.OPEN_MODE = 'openMode'
    this.READER_WINDOW_ID = 'readerWindowId'
    this.NEXT_PAGE_SELECTED_TEXT = 'nextPageSelectedText'
    this.PREVIOUS_PAGE_SELECTED_TEXT = 'previousPageSelectedText'
    this.LOCATION_STRING = 'locationString'
    this.CURRENT_URL = 'curUrl'
    this.ACTIVE_TAB_ID = 'activeTabId' // the tab id of the currently active tab, no matter what it is
    this.READER_WINDOW_X = 'readerWindowX'
    this.READER_WINDOW_Y = 'readerWindowY'
    this.READER_WINDOW_WIDTH = 'readerWindowWidth'
    this.READER_WINDOW_HEIGHT = 'readerWindowHeight'
    this.TO_TRACK_FIRST_INSTALL = 'toTrackFirstInstall'
    this.SAVE_TO_APP_ON_READER_OPEN = 'saveToAppOnReaderOpen'
    this.CURRENT_TITLE = 'curTitle'

    // keeping track of if we opened a Pro purchase window yet
    this.OPENED_PRO_WINDOW_ID = 'openedProWindowId'
    this.OPENED_PRO_TAB_ID = 'openedProTabId'

    // local settings, with defaults
    var _default_settings = {}
    _default_settings[this.CURRENT_DOMAIN] = undefined
    _default_settings[this.CURRENT_TAB_ID] = undefined
    _default_settings[this.SELECTED_TEXT] = undefined
    _default_settings[this.KEEP_RAW] = false
    _default_settings[this.OPEN_MODE] = undefined
    _default_settings[this.READER_WINDOW_ID] = undefined
    _default_settings[this.NEXT_PAGE_SELECTED_TEXT] = undefined
    _default_settings[this.PREVIOUS_PAGE_SELECTED_TEXT] = undefined
    _default_settings[this.LOCATION_STRING] = undefined
    _default_settings[this.CURRENT_URL] = undefined
    _default_settings[this.ACTIVE_TAB_ID] = undefined
    _default_settings[this.READER_WINDOW_X] = undefined
    _default_settings[this.READER_WINDOW_Y] = undefined
    _default_settings[this.READER_WINDOW_WIDTH] = 1000
    _default_settings[this.READER_WINDOW_HEIGHT] = 600
    _default_settings[this.TO_TRACK_FIRST_INSTALL] = true
    _default_settings[this.SAVE_TO_APP_ON_READER_OPEN] = false
    _default_settings[this.CURRENT_TITLE] = undefined

    _default_settings[this.OPENED_PRO_WINDOW_ID] = undefined
    _default_settings[this.OPENED_PRO_TAB_ID] = undefined

    var _settings = null

    // getters
    this.getAllSettings = function () {
      if (_settings !== null) {
        return _settings
      } else {
        throw "Background storage cache not yet initialized. Use its 'isInitialized' promise."
      }
    }
    this.getSetting = function (key) {
      if (_settings !== null) {
        return _settings[key]
      } else {
        throw "Background storage cache not yet initialized. Use its 'isInitialized' promise."
      }
    }
    this.getSettingFromStorage = function (key) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get([key], function (result) {
          const value = result[key]
          if (typeof value === 'undefined') {
            // not in storage, check default settings
            if (_settings !== null) {
              resolve(_settings[key])
            } else {
              reject(
                `Background storage key '${key}' not in storage or default settings.`
              )
            }
          } else {
            resolve(value)
          }
        })
      })
    }
    // setters
    this.setSetting = function (key, value) {
      return new Promise((resolve, reject) => {
        if (_settings !== null) {
          // set setting locally
          _settings[key] = value

          // set setting in storage
          var setting = {}
          setting[key] = value
          chrome.storage.local.set(setting, function () {
            if (chrome.runtime.lastError) {
              return reject(chrome.runtime.lastError)
            }
            resolve()
          })
        } else {
          return reject(
            "Background storage cache not yet initialized. Use its 'isInitialized' promise."
          )
        }
      })
    }
    this.getSettingKey = function (identifier) {
      return this[identifier]
    }
    this.getDefaultSettings = function () {
      return _default_settings
    }

    this.removeSetting = function (key) {
      return new Promise((resolve, reject) => {
        if (_settings !== null) {
          // set local cache at key to its default value
          _settings[key] = _default_settings[key]

          // remove the key in storage
          chrome.storage.local.remove(key, function () {
            if (chrome.runtime.lastError) {
              return reject(chrome.runtime.lastError)
            }
            resolve()
          })
        } else {
          throw "Background storage cache not yet initialized. Use its 'isInitialized' promise."
        }
      })
    }

    // finish initialization: set local settings to defaults + what's in storage.
    // i.e. sync local settings to union of what's in storage + defaults, but only once / upon initialization
    // because local settings will match storage settings, upon app reload, if any of the settings change (e.g. from options)
    // getting settings from storage is async, so create a promise
    this.isInitialized = new Promise(function (resolve, reject) {
      chrome.storage.local.get(null, function (result) {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError)
        }
        // now have all settings from storage
        // initialize with settings, union/overwrite with settings from storage
        var initialSettings = {
          ..._default_settings,
          ...result,
        }
        _settings = initialSettings
        // console.log('Background storage cache init-ed to: ', _settings);
        resolve()
      })
    })
  }

  clear(callback = null) {
    // clear settings sync
    chrome.storage.local.clear(callback)
  }
}

async function initializeBackgroundStorage() {
  var bgs = new BackgroundStorageCache()
  await bgs.isInitialized
  return bgs
}

if (typeof module === 'object') {
  module.exports = { BackgroundStorageCache, initializeBackgroundStorage }
}
