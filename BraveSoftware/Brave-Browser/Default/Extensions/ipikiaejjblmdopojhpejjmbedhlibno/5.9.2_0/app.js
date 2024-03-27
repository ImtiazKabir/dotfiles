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

var selectedText
var preSanitizedSelectedText
const defaultSelectedTextSanitizeRegex = '\\s?\\[.*?\\d+.*?\\]'
var keepRaw

var splitText
var splitTextIndexes
var rawSplitText
var nonChunkedSplitText
var unprocessedNonChunkedSplitText

var wpm
var chunkSize
var style
var highlightMode
var highlightColor
var highlightColorUseCustom
var fontColor
var fontColorEnabled
var backgroundColor
var backgroundColorEnabled
var letterSpacing
var focusLetterIndicatorEnabled
var contextFromRightEnabled
var activeWordOffsetFromCenterPctOfHalfWidth = 0.33

var font

var wordDiv
var wpmDiv
var fontSizeDiv

var chunkSizeDiv
var wordIndex // the index of the current "word"(s), could be composed of multiple words if chunk size > 1
var currentFirstTokenIndex // the "universal" index of the first word/token in the current word
function setCurrentFirstTokenIndex() {
  currentFirstTokenIndex =
    splitTextIndexes.length > 0 ? splitTextIndexes[wordIndex][0] : 0
}

var pauseButton
var playButton
var resetButton
var rewindButton
var forwardButton
var listenButton
var listenButtonHasNotification =
  localStorage.getItem('listenButtonHasNotification') === 'false' ? false : true

var wordTimer
var timerDelay = 3 // reading start timer

var windowWidth
var windowHeight
var windowX
var windowY

var maxWpm

var delay
const FUNCTION_EXECUTION_DISCOUNT_MS = 30

var slider
var sliderCheckbox

var timerCountdown
var timerTimeout
var timerBorderWidth

var inits = 0
var popupClosed = 0

var timeEstimate = 0

var hide = 0
let selectorsToHide =
  '#status, #controls, .control-visibility, #slider-container'
let contextSelectors = '#context-container .context, .multiline-context'

var language = 0 //0 english/unknown. 1 chinese. 2 arabic.

var timerCount = 0

var readingTimer
var currentTimeSpent = 0 // current reading session time spent

var loadingTimer
var loadingStats

var totalTimeSpent // total time spent
var wordCount // total words read
var currentWordCount = 0 // current reading session words read
var nationalWpmAverage = 250.0
var statsMode = 0

var _MS_PER_DAY = 1000 * 60 * 60 * 24

var articleShareThreshold
var shareButtons

var controls

var enablemicropauseNumbers
var enablemicropausePunctuation
var enablemicropauseLongWords
var enablemicropauseParagraph
var micropauseNumbersFactor
var micropausePunctuationFactor
var micropauseEndingPunctuationFactor
var micropauseLongWordsFactor
var micropauseParagraphFactor
var wpmInterval
var contextDisplayStyle
var enableMultilineContext
var contextOpacity
var selectedTextSanitizationRule
var sanitizeInlineCitationsEnabled
var sanitizeURLsEnabled

var autoTurnPage
var extractNextPageThreshold
var extractingNextPage = false

var hotkeyPlay
var hotkeyRewind
var hotkeyReset
var hotkeyForward
var hotkeyQuit
var hotkeyHide
var hotkeyWPMIncrease
var hotkeyWPMDecrease
var hotkeyChunkSizeIncrease
var hotkeyChunkSizeDecrease
var hotkeyFontSizeIncrease
var hotkeyFontSizeDecrease
var hotkeyFullscreen
var hotkeyPageLeft
var hotkeyPageRight
var hotkeyToggleContextMode
var hotkeyToggleListen

// global listen state
let listenEnabled
let fullSSML

let homepageUrl

// source tab info
let curUrl
let currentDomain
let currentTabId
let currentTitle

// current spreed window info
let spreedTabId
// store the tab id of THIS spreed window
getActiveTab(function (tab) {
  spreedTabId = tab.id
})

const tagR = /<([\/]*([^>]+))>/gi

// timing helpers
const average = (array) => array.reduce((a, b) => a + b) / array.length
let functionExecTimes = []
let betweenFunctionExecTimes = []
let lastFunctionExecTime = null

let onboardingTutorial

var state = {
  settingsStore: null,
  settingsShown: false,
  isPlaying: false,
  isPreloadingNext: false,
  isFullscreen: false,
  unmaximizedWindow: {
    width: null,
    height: null,
    x: null,
    y: null,
  },
}

//STORAGE FUNCTIONS

function _dictIsEmpty(obj) {
  for (var prop in obj) {
    if (obj.hasOwnProperty(prop)) return false
  }

  return true
}

function _localStorageSetdefault(key, defaultValue) {
  let value = localStorage.getItem(key)
  //console.log("key: "+key);
  //console.log("value: "+value);

  if (value == null || value == undefined) {
    localStorage.setItem(key, defaultValue)
    return defaultValue
  } else {
    return value
  }
}

function getSetting(key) {
  if (state.settingsStore !== null) {
    return state.settingsStore.getSetting(key)
  } else {
    throw 'Cannot get settings from a null settingsStore in state.'
  }
}

function startLoadingTimer() {
  if (loadingTimer != null) clearInterval(loadingTimer)
  const maxLoadTime = 15000
  let elapsedTime = 0
  const intervalLength = 100
  loadingTimer = setInterval(function () {
    elapsedTime += intervalLength
    if (elapsedTime > maxLoadTime) {
      showLoadingError('Text processing timed out')
      clearInterval(loadingTimer)
    }
  }, intervalLength)
}

// a and b are javascript Date objects
function dateDiffInDays(a, b) {
  return Math.round((b - a) / _MS_PER_DAY)
}

/**
 * Encode an object as url query string parameters
 * - includes the leading "?" prefix
 * - example input — {key: "value", alpha: "beta"}
 * - example output — output "?key=value&alpha=beta"
 * - returns empty string when given an empty object
 */
function encodeQueryString(params) {
  const keys = Object.keys(params)
  return keys.length
    ? '?' +
        keys
          .map(
            (key) =>
              encodeURIComponent(key) + '=' + encodeURIComponent(params[key])
          )
          .join('&')
    : ''
}

function groupWords(splitText, chunkSize) {
  var newSplitText = new Array()
  splitTextIndexes = new Array() // array of arrays. element array element is the index of the words in that chunk
  chunkCount = 0

  for (var i = 0; i < splitText.length; i = i + chunkSize) {
    var newChunk = ''
    let newSplitTextIndexChunk = new Array()
    for (var j = 0; j < chunkSize; j++) {
      if (i + j < splitText.length) {
        newChunk = newChunk + splitText[i + j] + ' '
        newSplitTextIndexChunk.push(i + j)
      }
    }

    if (newChunk == ' ') {
      newChunk = '_'
    }

    newSplitText.push(newChunk)
    splitTextIndexes.push(newSplitTextIndexChunk)
  }

  //get rid of all spaces within chunks, if is chinese

  if (language == 1) {
    newSplitText2 = []
    for (var i = 0; i < newSplitText.length; i++) {
      temp = newSplitText[i].split(' ')

      newtemp = temp.join('')

      newSplitText2.push(newtemp)
    }

    return newSplitText2
  } else {
    return newSplitText
  }
}

function _combineNumbers(theSplitText) {
  newList = Array()
  var i = 0
  while (i < theSplitText.length) {
    curChar = theSplitText[i]
    if (theSplitText[i].match(/[0-9]/)) {
      curChar = ''
      while (theSplitText[i].match(/[0-9]/)) {
        curChar += theSplitText[i]
        i += 1
      }
      newList.push(curChar)
    } else {
      newList.push(curChar)
      i += 1
    }
  }
  //console.log(newList);
  return newList
}

function _combineEnglishWords(theSplitText) {
  //console.log('combine english');

  newList = Array()
  var i = 0
  while (i < theSplitText.length) {
    curChar = theSplitText[i]
    if (theSplitText[i].match(/[a-zA-Z]/)) {
      curChar = ''
      while (theSplitText[i].match(/[a-zA-Z]/)) {
        curChar += theSplitText[i]
        i += 1
      }
      newList.push(curChar)
    } else {
      newList.push(curChar)
      i += 1
    }
  }

  return newList
}

function HasArabicCharacters(text) {
  var arregex = /[\u0600-\u06FF]/
  return arregex.test(text)
}

async function getLanguage(text) {
  let detected
  if (chrome && chrome.i18n) {
    detected = await chrome.i18n.detectLanguage(text)
  } else if (browser && browser.i18n) {
    detected = await browser.i18n.detectLanguage(text)
  }
  if (detected) {
    let detectedLanguages = detected.languages
    // sort detected language objects by percentage key, descending
    detectedLanguages = detectedLanguages.sort(
      (a, b) => b.percentage - a.percentage
    )
    // return the language code of the first object
    return detectedLanguages[0].language
  } else {
    return
  }
}

function _splitSelectedText(selectedText) {
  // example: english article with some chinese characters: https://www.theatlantic.com/technology/archive/2018/01/the-shallowness-of-google-translate/551570/

  // detect chinese or japanese
  const allAsianChars = selectedText.match(/[\u3400-\u9FBF]/g) // could be null if there's no match
  // if (allAsianChars) console.log('allAsianChars length:',allAsianChars.length);
  // console.log('selectedText without whitespace:',selectedText.replace(/\s+/g, ""))
  // console.log('selectedText without whitespace length:',selectedText.replace(/\s+/g, "").length);

  //more than 50% of non-space characters
  if (
    allAsianChars &&
    (1.0 * allAsianChars.length) / selectedText.replace(/\s+/g, '').length > 0.5
  ) {
    // split everything at the character level
    var theSplitText = selectedText.split('')
    // naive: BUT don't split numbers, or english words, regroup them into "words"
    theSplitText = _combineNumbers(theSplitText)
    theSplitText = _combineEnglishWords(theSplitText)
    // filter OUT characters that are only whitespace
    theSplitText = theSplitText.filter((character) =>
      character.match(/\s+/) ? false : true
    )

    // TODO: asian languages have a different default chunk size?
    language = 1

    console.log('language:', language)
  } else {
    // i used to have "scientific notation handling" here, it was causing issues so i removed it

    //split on whitespace
    theSplitText = selectedText.split(/[\s]+/)
  }

  theSplitText = _removeEmpty(theSplitText)

  if (HasArabicCharacters(selectedText)) {
    //console.log('arabic detected!');
    //todo: RIGHT TO LEFT
  }
  return theSplitText
}

// // _preProcessSelectedText is not used by anything anymore...
// function _preProcessSelectedText(selectedText, raw = false) {
//   //add space after em dashes
//   selectedText = selectedText.replace(/\u2014/g, '\u2014 ')

//   // remove any HTML comments
//   selectedText = selectedText.replace(/(?=<!--)([\s\S]*?-->)/g, '')

//   if (!raw) {
//     // add space before any start style tags that were kept, BUT ONLY IF THERE ISN'T ALREADY A SPACE, to treat them as separate "words"
//     // e.g. "this is some text<h1>a new header</h1>"
//     selectedText = selectedText.replace(/([^\s])(<[^>\/]+>)/gi, '$1 $2')
//     // add space after any end style tags that were kept, BUT ONLY IF THERE ISN'T ALREADY A SPACE, to treat them as separate "words"
//     // e.g. "<h1>this is a header</h1>this is some text"
//     selectedText = selectedText.replace(/(<\/[^>\/]+>)([^\s])/gi, '$1 $2')
//     // remove space between any consecutive start or close tags
//   } else {
//     // is raw: either selected text, or kindle cloud reader text or PDF
//     // console.log('currentDomain:',currentDomain);
//     // if kindle or PDF text
//     if (
//       currentDomain &&
//       (currentDomain.includes('.amazon.') || currentDomain.includes('/pdf.js/'))
//     ) {
//       // if text from kindle cloud reader or some other "custom" reader where we intentially insert html tags, don't do anything
//     }
//     // otherwise it's raw text
//     else {
//       // replace any < or > with their html codes so that swiftread still shows them
//       selectedText = selectedText.replace(/\</g, '&lt;')
//       selectedText = selectedText.replace(/\>/g, '&gt;')
//     }
//   }

//   return selectedText
// }

function _sanitizeSelectedText(inputSelectedText) {
  // console.log("selectedText before sanitization: ", inputSelectedText);
  let sanitizedSelectedText = inputSelectedText

  // if there is a custom user sanitization rule, apply it
  if (selectedTextSanitizationRule && selectedTextSanitizationRule.length > 0) {
    console.log(
      'selectedText sanitization rule after escaping back slashes:',
      selectedTextSanitizationRule.replaceAll('\\', '\\\\')
    )
    const regex = new RegExp(selectedTextSanitizationRule, 'g')
    sanitizedSelectedText = sanitizedSelectedText.replaceAll(regex, '')
  }

  // sanitize inline citations if enabled
  if (sanitizeInlineCitationsEnabled === true) {
    // bracket dictations
    const bracketCitationRegex = /\s*\[.*?\d+\](\s?)[,\-]?\s?/gm
    sanitizedSelectedText = sanitizedSelectedText.replaceAll(
      bracketCitationRegex,
      '$1'
    )

    // parenthesis citations
    const parenCitationRegex =
      /\s*\((?:[a-zA-Z0-9]+\s\d+|[12][0-9]{3}|(?:page|pg|p)\.?\s?\d+|\b\d+-\d+\b|[A-Za-z]+[^)]*?\d+)\)(\s?)/gm
    sanitizedSelectedText = sanitizedSelectedText.replaceAll(
      parenCitationRegex,
      '$1'
    )
  }
  // sanitize URLs if enabled
  if (sanitizeURLsEnabled === true) {
    const urlsRegex =
      /[\[\(]?\s*https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)\s*[\]\)]?/gm
    sanitizedSelectedText = sanitizedSelectedText.replaceAll(urlsRegex, '')
  }

  // console.log('selectedText after sanitization: ', sanitizedSelectedText);

  return sanitizedSelectedText
}

function _getWordStartInHtml(html) {
  let inHtmlTag = false
  for (let i = 0; i < html.length; i++) {
    const curChar = html[i]
    // ignore any preceding whitespace
    if (
      curChar
        .replace(/\u200c/g, '')
        .replace(/\u00a0/g, '')
        .replace(/\s/g, '').length === 0
    ) {
      continue
    }

    // if still in html tag
    if (inHtmlTag) {
      if (curChar === '>') {
        inHtmlTag = false
      }
    } else if (!inHtmlTag) {
      if (curChar === '<') {
        inHtmlTag = true
      } else {
        // not in HTML tag any more, this must be the "first word", return index
        return i
      }
    }
  }
}
function _processNonChunkedSplitTextStyling(nonChunkedSplitText) {
  let newNonChunkedSplitText = []
  let activeTags = []
  const startTagR = /<([^>|\/]+)>/gi
  const endTagR = /<\/([^>]+)>/gi

  // iterate through words
  for (let i = 0; i < nonChunkedSplitText.length; i++) {
    let word = nonChunkedSplitText[i]
    // console.log('---');
    // console.log('current word:', word);

    // try to match tags and words
    const allTagMatches = [...word.matchAll(tagR)].map((match) => {
      match.isClose = match[1].includes('/') ? true : false
      return match
    }) // [tagName, true/false is opening tag, raw tag]
    // console.log('all tag matches:',allTagMatches);

    // get position of word
    const wordAlone = word.replace(tagR, '') // to handle special case: "<b>word</b>.". worAlone is "word." but the entire substring is not in the word...
    // get index of word start, where any preceding html tags end
    let wordIndex = _getWordStartInHtml(word)
    // word.indexOf(wordAlone);

    // console.log('wordAlone:',wordAlone);
    // console.log('wordIndex:',wordIndex);

    // iterate through each character
    let inTag = false
    let isCloseTag = false
    let newWord = ''
    let curTag = ''
    let wordStartIndex
    let openTagEndIndex
    let closeTagEndIndex
    for (let j = 0; j < word.length; j++) {
      const char = word[j]
      if (char === '<') {
        inTag = true
      } else if (char === '/') {
        if (inTag) isCloseTag = true
      } else if (char === '>') {
        // detected end of current tag
        if (!isCloseTag) {
          // we finished an open tag
          activeTags.push(curTag)
          // keep track of end of open tag
          openTagEndIndex = j
          // add start span
          newWord += `<span class='start ${curTag}'></span>`
        } else {
          // we finished a closing tag
          // keep track of end of closing tag
          closeTagEndIndex = j
          // remove from activeTags
          const index = activeTags.indexOf(curTag)
          if (index > -1) {
            activeTags.splice(index, 1)
            // add end span
            newWord += `<span class='end ${curTag}'></span>`
          }
        }
        // console.log('curTag:', curTag);
        // console.log('isCloseTag:',isCloseTag);

        isCloseTag = false
        inTag = false
        curTag = ''
      } else {
        if (inTag) curTag += char
        else {
          // if at start of word, encapsulate
          if (j === wordIndex) {
            const startTagString = activeTags.map((x) => `<${x}>`).join('')
            const endTagString = activeTags
              .reverse()
              .map((x) => `</${x}>`)
              .join('')
            newWord += `${startTagString}${wordAlone}${endTagString}`
          }
        }
      }
    }
    // console.log('activeTags:',activeTags);
    // console.log('newWord:', newWord);

    newNonChunkedSplitText.push(newWord)

    // console.log('---');
  }

  return newNonChunkedSplitText
}

// run on init and when context settings are changed
function updateContextDisplayStyle(initial = false) {
  contextDisplayStyle = getSetting(
    state.settingsStore.SETTING_CONTEXT_DISPLAY_KEY
  )
  enableMultilineContext =
    getSetting(state.settingsStore.SETTING_COMBINE_BIGWORD_WITH_CONTEXT_KEY) ===
    'true'
      ? true
      : false
  // console.log('contextDisplayStyle:',contextDisplayStyle);
  // console.log('enableMultilineContext:',enableMultilineContext);
  contextFromRightEnabled =
    getSetting(state.settingsStore.SETTING_CONTEXT_FROM_RIGHT_ENABLED_KEY) ===
    'true'
      ? true
      : false
  // console.log('contextFromRightEnabled:', contextFromRightEnabled);

  if (initial === false) {
    // console.log('repositioning word...');
    // set word and context font size to be the same
    updateCustomStyleElements()

    setUpContextDisplay()
    // DOM changes take a little bit of time to propogate because menu overlay is fading out / closing, so need to keep running positionWord() until reading area is set
    let previousWordY = -999
    let previousPostMLContextY = -999
    let positionInterval = setInterval(() => {
      let readerEl = document.getElementById('word-container')
      let wordEl = $('#context-container #context').get(0)
      let postMLContext = document.getElementById(
        'post-multiline-context-container'
      )

      const readerBounds = readerEl.getBoundingClientRect()
      const wordBounds = wordEl.getBoundingClientRect()
      const postMLContextBounds = postMLContext.getBoundingClientRect()
      const wordYEnd = wordBounds.y + wordBounds.height
      const readerCenterY = readerBounds.y + readerBounds.height / 2
      // check position of readerEl
      // console.log('checking reader y: ', readerBounds.y);
      // console.log('checking word position: ', wordBounds.y);
      // console.log('checking previous word position: ', previousWordY);
      // console.log('postMLContext display: ', postMLContext.style.display);
      // console.log('readerEl: ', readerEl);
      // console.log('wordYEnd: ', wordYEnd);
      // console.log('readerCenterY: ', readerCenterY);

      // if reader is visible
      // and word has stopped moving
      // and bottom of word is after half-way point of the reader's height
      // and (post-multiline-context has stopped moving or is not supposed to be shown)
      if (
        readerBounds.y > 0 &&
        wordBounds.y === previousWordY &&
        wordYEnd > readerCenterY
      ) {
        clearInterval(positionInterval)
      } else {
        previousWordY = wordBounds.y
        positionWord()
      }
    }, 300)
  }
}

function getFocusLetterIndicatorSettings(initial = false) {
  focusLetterIndicatorEnabled =
    getSetting(
      state.settingsStore.SETTING_FOCUS_LETTER_INDICATOR_ENABLED_KEY
    ) === 'true'
      ? true
      : false
  if (initial === false) {
    updateContextDisplayStyle()
    positionWord()
  }
}
function getSanitizationRuleSettings(initial = false) {
  selectedTextSanitizationRule = getSetting(
    state.settingsStore.SETTING_SANITIZATION_RULE_KEY
  )
  // console.log('pre sanitized selectedText length:', preSanitizedSelectedText.length);
  // try matching with whitespace to see if the entire selectedText was just whitespace
  const preSanitizedSelectedTextNoWhitespace =
    preSanitizedSelectedText.replaceAll(/\s+/g, '')
  // console.log('pre sanitized selectedText no whitespace: ', preSanitizedSelectedTextNoWhitespace);
  // console.log('preSanitizedSelectedTextNoWhitespace length: ', preSanitizedSelectedTextNoWhitespace.length);
  if (preSanitizedSelectedTextNoWhitespace.length === 0) {
    // select text was already all whitespace
    // show empty swiftread window but suggest to user to turn the page (if page turn buttons exist) or open swiftread on non-empty text
    return
  }

  // then santize original text with input regex
  const postSanitizedText = _sanitizeSelectedText(preSanitizedSelectedText)
  console.log('post sanitized selectedText length:', postSanitizedText.length)
  const postSanitizedTextNoWhitespace = postSanitizedText.replaceAll(/\s+/g, '')
  // console.log('post sanitized selectedText without witespace length:', postSanitizedTextNoWhitespace.length);
  // protect against rules that sanitize ALL the text (very likely a mistake)

  if (
    postSanitizedTextNoWhitespace.length === 0 &&
    preSanitizedSelectedText.length > 0
  ) {
    alert(
      'Notice: That regex sanitized the entire document! Reverting regex to the default regex, try again.'
    )
    state.settingsStore.setSetting(
      state.settingsStore.SETTING_SANITIZATION_RULE_KEY,
      defaultSelectedTextSanitizeRegex
    )
    // reload settings
    openSettings()
  } else {
    if (!initial) {
      alert(
        `Sanitized the text with the new regex. \n\nNum chars before sanitization: ${preSanitizedSelectedText.length}. After sanitization: ${postSanitizedText.length}`
      )
    }
  }
}
function getHarcodedSanitizationSetting(initial = false) {
  sanitizeInlineCitationsEnabled =
    getSetting(
      state.settingsStore.SETTING_SANITIZE_INLINE_CITATIONS_ENABLED_KEY
    ) == 'true'
      ? true
      : false
  sanitizeURLsEnabled =
    getSetting(state.settingsStore.SETTING_SANITIZE_URLS_ENABLED_KEY) == 'true'
      ? true
      : false
  if (initial === false) {
    processAndPrepareText((resetWordIndex = true))
  }
}
function getMicropauseSettings() {
  enablemicropauseNumbers =
    getSetting(state.settingsStore.SETTING_MICROPAUSE_NUMBERS_ENABLED_KEY) ===
    'true'
      ? true
      : false
  enablemicropausePunctuation =
    getSetting(
      state.settingsStore.SETTING_MICROPAUSE_PUNCTUATION_ENABLED_KEY
    ) === 'true'
      ? true
      : false
  enablemicropauseLongWords =
    getSetting(state.settingsStore.SETTING_MICROPAUSE_LONGWORDS_ENABLED_KEY) ===
    'true'
      ? true
      : false
  enablemicropauseParagraph =
    getSetting(state.settingsStore.SETTING_MICROPAUSE_PARAGRAPH_ENABLED_KEY) ===
    'true'
      ? true
      : false

  micropauseNumbersFactor = getSetting(
    state.settingsStore.SETTING_MICROPAUSE_NUMBERS_FACTOR_KEY
  )
  micropausePunctuationFactor = getSetting(
    state.settingsStore.SETTING_MICROPAUSE_PUNCTUATION_FACTOR_KEY
  )
  micropauseEndingPunctuationFactor = getSetting(
    state.settingsStore.SETTING_MICROPAUSE_ENDING_PUNCTUATION_FACTOR_KEY
  )
  micropauseLongWordsFactor = getSetting(
    state.settingsStore.SETTING_MICROPAUSE_LONGWORDS_FACTOR_KEY
  )
  micropauseParagraphFactor = getSetting(
    state.settingsStore.SETTING_MICROPAUSE_PARGRAPH_FACTOR_KEY
  )
}
function getTimerDelay() {
  const timerEnabled = getSetting(
    state.settingsStore.SETTING_START_TIMER_ENABLED_KEY
  )

  if (timerEnabled === 'true') {
    timerDelay = getSetting(state.settingsStore.SETTING_START_TIMER_LENGTH_KEY)
  } else {
    timerDelay = null
  }
  // console.log('auto-start timerEnabled, ', timerEnabled);
  // console.log('auto-start timerDelay, ', timerDelay);
}
function getWPMInterval() {
  wpmInterval = getSetting(state.settingsStore.SETTING_WPM_INTERVAL_KEY)
  if (typeof wpmInterval !== 'undefined' && wpmInterval !== null) {
    wpmInterval = parseInt(wpmInterval)
  }
}
function getAutoPageTurnSettings() {
  autoTurnPage =
    getSetting(state.settingsStore.SETTING_AUTO_PAGE_TURN_ENABLED_KEY) ===
    'true'
      ? true
      : false
}
function getHotkeyPlay() {
  hotkeyPlay = getSetting(state.settingsStore.SETTING_HOTKEY_PLAY_KEY)
}
function getHotkeyRewind() {
  hotkeyRewind = getSetting(state.settingsStore.SETTING_HOTKEY_REWIND_KEY)
}
function getHotkeyReset() {
  hotkeyReset = getSetting(state.settingsStore.SETTING_HOTKEY_RESET_KEY)
}
function getHotkeyForward() {
  hotkeyForward = getSetting(state.settingsStore.SETTING_HOTKEY_FORWARD_KEY)
}
function getHotkeyQuit() {
  hotkeyQuit = getSetting(state.settingsStore.SETTING_HOTKEY_QUIT_KEY)
}
function getHotkeyHide() {
  hotkeyHide = getSetting(state.settingsStore.SETTING_HOTKEY_HIDE_KEY)
}
function getHotkeyWPM() {
  hotkeyWPMIncrease = getSetting(
    state.settingsStore.SETTING_HOTKEY_WPM_INCREASE_KEY
  )
  hotkeyWPMDecrease = getSetting(
    state.settingsStore.SETTING_HOTKEY_WPM_DECREASE_KEY
  )
}
function getHotkeyChunkSize() {
  hotkeyChunkSizeIncrease = getSetting(
    state.settingsStore.SETTING_HOTKEY_CHUNK_SIZE_INCREASE_KEY
  )
  hotkeyChunkSizeDecrease = getSetting(
    state.settingsStore.SETTING_HOTKEY_CHUNK_SIZE_DECREASE_KEY
  )
}
function getHotkeyFontSize() {
  hotkeyFontSizeIncrease = getSetting(
    state.settingsStore.SETTING_HOTKEY_FONT_SIZE_INCREASE_KEY
  )
  hotkeyFontSizeDecrease = getSetting(
    state.settingsStore.SETTING_HOTKEY_FONT_SIZE_DECREASE_KEY
  )
}
function getHotkeyFullscreen() {
  hotkeyFullscreen = getSetting(
    state.settingsStore.SETTING_HOTKEY_FULLSCREEN_KEY
  )
}
function getHotkeyPageLeftRight() {
  hotkeyPageLeft = getSetting(state.settingsStore.SETTING_HOTKEY_PAGE_LEFT)
  hotkeyPageRight = getSetting(state.settingsStore.SETTING_HOTKEY_PAGE_RIGHT)
}
function getHotkeyToggleContextMode() {
  hotkeyToggleContextMode = getSetting(
    state.settingsStore.SETTING_TOGGLE_CONTEXT_MODE
  )
}
function getHotkeyToggleListen() {
  hotkeyToggleListen = getSetting(
    state.settingsStore.SETTING_HOTKEY_TOGGLE_LISTEN_KEY
  )
}
function reloadAppHotkeys() {
  console.log('reloading app hotkeys...')
  hotkeys.deleteScope('app')
  hotkeys('*', { scope: 'app' }, checkKeypress)
  // play
  getHotkeyPlay()
  hotkeys(hotkeyPlay, { scope: 'app' }, function (event, handler) {
    if (state.isPlaying === true) {
      pause()
    } else {
      play()
    }
  })
  // rewind
  getHotkeyRewind()
  hotkeys(hotkeyRewind, { scope: 'app' }, function (event, handler) {
    rewind()
  })
  // forward
  getHotkeyForward()
  hotkeys(hotkeyForward, { scope: 'app' }, function (event, handler) {
    forward()
  })
  // reset
  getHotkeyReset()
  hotkeys(hotkeyReset, { scope: 'app' }, function (event, handler) {
    reset()
  })
  // quit
  getHotkeyQuit()
  hotkeys(hotkeyQuit, { scope: 'app' }, function (event, handler) {
    close()
  })
  // fullscreen
  getHotkeyFullscreen()
  hotkeys(hotkeyFullscreen, { scope: 'app' }, function (event, handler) {
    toggleFullScreen()
  })
  // page left/right
  getHotkeyPageLeftRight()
  hotkeys(hotkeyPageLeft, { scope: 'app' }, function (event, handler) {
    const pageTurnLeft = $('#page-turn-left a')
    if (pageTurnLeft.length > 0) {
      pageTurnLeft.trigger('click')
    }
  })
  hotkeys(hotkeyPageRight, { scope: 'app' }, function (event, handler) {
    const pageTurnRight = $('#page-turn-right a')
    if (pageTurnRight.length > 0) {
      pageTurnRight.trigger('click')
    }
  })
  // toggle context mode
  getHotkeyToggleContextMode()
  hotkeys(hotkeyToggleContextMode, { scope: 'app' }, function (event, handler) {
    // console.log('current contextDisplayStyle:', contextDisplayStyle);
    if (contextDisplayStyle === 'always') {
      state.settingsStore.setSetting(
        state.settingsStore.SETTING_CONTEXT_DISPLAY_KEY,
        'on-pause'
      )
    } else if (
      contextDisplayStyle === 'on-pause' ||
      contextDisplayStyle === 'never'
    ) {
      state.settingsStore.setSetting(
        state.settingsStore.SETTING_CONTEXT_DISPLAY_KEY,
        'always'
      )
      $(contextSelectors).css('opacity', '') // show contextSelectors in case opacity is 0
    }
    updateContextDisplayStyle()
    positionWord()
  })

  // wpm
  getHotkeyWPM()
  hotkeys(hotkeyWPMIncrease, { scope: 'app' }, function (event, handler) {
    increaseWPM()
  })
  hotkeys(hotkeyWPMDecrease, { scope: 'app' }, function (event, handler) {
    decreaseWPM()
  })
  // chunk size
  getHotkeyChunkSize()
  hotkeys(hotkeyChunkSizeIncrease, { scope: 'app' }, function (e, h) {
    increaseChunkSize()
  })
  hotkeys(hotkeyChunkSizeDecrease, { scope: 'app' }, function (e, h) {
    decreaseChunkSize()
  })
  // font size
  getHotkeyFontSize()
  hotkeys(hotkeyFontSizeIncrease, { scope: 'app' }, function (e, h) {
    increaseFontSize()
  })
  hotkeys(hotkeyFontSizeDecrease, { scope: 'app' }, function (e, h) {
    decreaseFontSize()
  })

  // toggle listen
  getHotkeyToggleListen()
  hotkeys(hotkeyToggleListen, { scope: 'app' }, function (event, handler) {
    handleListenButtonClick()
  })

  hotkeys.setScope('app')

  // refresh the help div which shows the hotkeys
  addHelpDiv()
}
function addHelpDiv() {
  const helpDiv = `
	<div style="display:none" id="inline-tips-container">
		<div id="help-div">
			<div class="support-contact">
				<h1>Have questions or comments?</h1>
				<a href="https://swiftread.com/help" target="_blank"><button class="btn btn-primary">🛟 Reach out for help</button></a>
			</div>

			<div>
				<button id="reopen-tutorial" class="btn btn-primary">Re-open Tutorial</button>
			</div>

			<h1>Hotkeys</h1>
			<div id="hotkey-quicktips">

				<div class="row">
					<kbd>${hotkeyPlay}</kbd><div>Play/Pause</div>
				</div>

				<div class="row">
					<kbd>${hotkeyFullscreen}</kbd><div>Toggle Full-screen</div>
				</div>
				
				<div class="row">
					<kbd>${hotkeyRewind}</kbd><div>Rewind</div>
				</div>

				<div class="row">
					<kbd>${hotkeyForward}</kbd><div>Fast-forward</div>
				</div>

				<div class="row">
					<kbd>${hotkeyReset}</kbd><div>Reset</div>
				</div>
					
				<div class="row">	
					<kbd>1,2...9,0</kbd><div>Seek to position in text</div>
				</div>

				<div class="row">
					<kbd>${hotkeyWPMDecrease} </kbd><kbd> ${hotkeyWPMIncrease}</kbd> <div>Decrease/Increase WPM</div>
				</div>

				<div class="row">
					<kbd>${hotkeyChunkSizeDecrease} </kbd><kbd> ${hotkeyChunkSizeIncrease}</kbd> <div>Decrease/Increase words at a time</div>
				</div>

				<div class="row">
					<kbd>${hotkeyFontSizeDecrease} </kbd><kbd> ${hotkeyFontSizeIncrease}</kbd> <div>Decrease/Increase font size</div>
				</div>

				<div class="row">
					<kbd>${hotkeyPageLeft} </kbd><kbd> ${hotkeyPageRight}</kbd> <div>Turn page left/right (PDFs, ePubs, etc.)</div>
				</div>

				<div class="row">
					<kbd>${hotkeyToggleContextMode} </kbd> <div>Toggle reading context mode</div>
				</div>

				<div class="row">
					<kbd>${hotkeyToggleListen} </kbd> <div>Toggle read aloud</div>
				</div>

				<div class="row">
					<kbd>${hotkeyQuit}</kbd><div>Close SwiftRead window</div>
				</div>

			</div>
			
		</div>
	</div>`
  if ($('#inline-tips-container').length > 0) {
    $('#inline-tips-container').remove()
  }
  $('body').append(helpDiv)

  // add event listeners
  // reopen tutorial
  $('#reopen-tutorial').on('click', function () {
    if (typeof onboardingTutorial !== 'undefined') {
      // get any existing help tippy and hide it
      const existingHelpTippy = document.getElementById('help-open')._tippy
      if (typeof existingHelpTippy !== 'undefined') {
        existingHelpTippy.hide()
      }

      if (onboardingTutorial.isActive) {
        onboardingTutorial.cancel()
      }
      onboardingTutorial.start()
    }
  })

  // set up tippy
  const existingHelpTippy = document.getElementById('help-open')._tippy
  if (typeof existingHelpTippy !== 'undefined') {
    existingHelpTippy.destroy()
  }
  const helpTippy = tippy('#help-open', {
    content: $('#help-div').get(0),
    allowHTML: true,
    placement: 'bottom',
    hideOnClick: true,
    trigger: 'click',
    interactive: true,
    appendTo: () => document.body,
    maxWidth: 'none',
  })
}

function setUpgradeButton() {
  const wasVisible = $('#upgrade-button').css('display') !== 'none'
  if (getUserLicense() === null) {
    $('#upgrade-button').css('display', 'inline-block')
  } else {
    if (wasVisible) {
      $('#upgrade-button').css('display', 'none')
    }
  }
}

function getActiveTab(callback) {
  chrome.tabs.query({ currentWindow: true, active: true }, function (tabs) {
    var tab = tabs[0]

    // console.log('active tab:',tab);
    if (tab.hasOwnProperty('id') === true) {
      // tab should always have an id
      // console.log('returning active tab:',tab);

      callback(tab)
    } else {
      pushEvent('error', 'no-spreed-window-tab')
      console.error('No active tab identified for current SwiftRead window.')
    }
  })
}

function addMouseListenersToToggleControls() {
  $(selectorsToHide).on('mouseenter', function (event) {
    // only when playing
    if (state.isPlaying === true) {
      showControls()
    }
  })
  $(selectorsToHide).on('mouseover', function (event) {
    // only when playing
    if (state.isPlaying === true) {
      showControls()
    }
  })
  $(selectorsToHide).on('mouseleave', function (event) {
    if (state.isPlaying === true) {
      hideControls()
    }
  })
}

function processAndPrepareText(resetWordIndex = false) {
  // console.log('processAndPrepareText called with resetWordIndex: ', resetWordIndex);

  if (resetWordIndex === true) {
    showLoadingSpinner()
    startLoadingTimer()
  }
  // console.log('selectedText before any processing: ', selectedText);

  // implement sanitizing regexes
  preSanitizedSelectedText = selectedText.slice()
  // get the hardcoded sanitization settings
  getHarcodedSanitizationSetting((initial = true))
  // get the user specified sanitization settings
  getSanitizationRuleSettings((initial = true))
  const sanitizedSelectedText = _sanitizeSelectedText(preSanitizedSelectedText)

  // if listen enabled, prepare HTML and SSML for listen
  // console.log('preparing HTML and SSML for both listen and visual reading...');
  const { htmlTokens, ssml } = prepareHTMLForListen(sanitizedSelectedText)
  fullSSML = ssml
  nonChunkedSplitText = htmlTokens
  // console.log('unprocessed nonChunkedSplitText html: ', nonChunkedSplitText);
  // console.log('unprocessed ssml: ', ssml);

  // partition SSML
  partitionSSML(fullSSML)

  // console.log('currentDomain:', currentDomain);
  // process HTML tag styling, but only if it is a website OR epub
  const urlType = getUrlType(curUrl)
  if (
    !keepRaw &&
    ((curUrl && urlType === UrlType.WebsiteStandard) ||
      urlType === UrlType.EpubReader)
  ) {
    nonChunkedSplitText =
      _processNonChunkedSplitTextStyling(nonChunkedSplitText)
    // console.log('processed nonChunkedSplitText:', nonChunkedSplitText);
  }
  // PROCESS TEXT END 1

  // PROCESS TEXT START 2
  // console.log('non chunked splitText: ', nonChunkedSplitText);
  // console.log('joined splitText: ', nonChunkedSplitText.join(" "));
  splitText = nonChunkedSplitText
  // remove leading and trailing whitespace in every string in split text
  splitText = splitText.map((x) => x.trim())

  //group words depending on chunk size
  splitText = groupWords(splitText, chunkSize)
  // console.log('grouped splitText: ', splitText);
  // console.log('grouped splitTextIndexes: ', splitTextIndexes);

  // save "raw" split text without any html tags and nbsp
  rawSplitText = splitText.map((x) => {
    x = x.replace(/<([^>]+)>\s*/gi, '')
    x = x.replace('&nbsp;', '')
    x = x.replace('&gt;', '')
    x = x.replace('&lt;', '')
    return x
  })
  // console.log('rawSplitText:',rawSplitText);

  // process words: find the middle letter and highlight
  // TODO: improve this so that it ignores tags and any other "special" characters elegantly
  splitText = splitText.map(processWord)
  // console.log('final splitText: ', splitText);

  // set first word
  // if we just opened this window, start from beginning
  if (resetWordIndex === true || !currentFirstTokenIndex) {
    // console.log("resetWordIndex true, resetting word index");
    wordIndex = 0
    setCurrentFirstTokenIndex()

    // if listen enabled, reset current ssml part index, because it's assumed that when we (re)process the text and resetWordIndex is true, means we just opened a new page
    if (listenEnabled === true) {
      console.log(
        'reset word index and listen enabled, reset current SSML part'
      )
      resetCurrentSSMLPartIndex()
    }
  } else {
    // get the wordIndex that has the pre-existing currentFirstTokenIndex
    let chunkIndex
    const targetSplitTextIndex = splitTextIndexes.filter(
      (indexChunk, index) => {
        const chunkHasIndex = indexChunk.indexOf(currentFirstTokenIndex) >= 0
        if (chunkHasIndex) {
          chunkIndex = index
          return true
        } else {
          return false
        }
      }
    )
    // should ever only be one "targetSplitTextIndex"
    if (
      targetSplitTextIndex &&
      chunkIndex &&
      targetSplitTextIndex.length === 1
    ) {
      // console.log('targetSplitTextIndex: ', targetSplitTextIndex);
      // console.log('chunkIndex: ', chunkIndex);

      wordIndex = chunkIndex
    } else {
      if (!targetSplitTextIndex) {
        console.error(
          '.filter returned null/undefined when looking for chunk with current token index'
        )
        pushEvent('error', 'filter-returned-null-for-chunk-with-current-token')
      } else {
        console.error(
          'more than one chunk found when looking for chunk with current token index:',
          targetSplitTextIndex.length
        )
        pushEvent(
          'error',
          'more-then-one-found-for-chunk-with-current-token',
          targetSplitTextIndex.length
        )
      }
    }
  }
  wordDiv = document.getElementById('word')

  // if listen is enabled, start async fetch the audio. only do this after wordIndex is initialized
  if (listenEnabled === true) {
    console.log(
      'listen enabled, so fetching audio for current word index: ',
      wordIndex
    )
    fetchAudioForWordIndex(wordIndex)
  }

  //estimated time
  //if less than 1 min, < 1
  updateTimeEstimate()
  // PROCESS TEXT END 2
  // PROCESS TEXT START 3
  // set first word
  // hiding the word containers is needed on first read, otherwise non-styled words flash
  wordDiv.style.display = 'none'

  wordDiv.innerHTML = splitText[wordIndex]
  waitUntil(
    function () {
      setUpContextDisplay() // need this right before positionWord, essentially
      positionWord()
    },
    function () {
      // the code that tests here... (return true if test passes; false otherwise)
      return !!(wordDiv.innerHTML !== '')
    },
    10 // amount to wait between checks
  )()
  // PROCESS TEXT END 3

  // PROCESS TEXT START 4
  // slider
  slider = $('#slider')

  slider.slider({
    orientation: 'horizontal',
    max: splitText.length - 1,
    min: 0,
    slide: function (event, ui) {
      // console.log('slider: slide event fired, moving wordIndex to ui.value: ', ui.value);

      if (event.originalEvent) {
        // user slid the slider
        wordIndex = ui.value
        // move the pacer but don't fetch any audio
        movePacerToWordIndexUserInitiated(wordIndex, (ignoreAudio = true))
      }
    },
    change: function (event, ui) {
      // console.log('slider: change event fired, moving wordIndex to ui.value: ', ui.value);
      if (event.originalEvent) {
        // slider value actually changed
        wordIndex = ui.value
        // move the pacer and actually fetch any new audio
        movePacerToWordIndexUserInitiated(wordIndex)
      }
    },
  })
  // PROCESS TEXT END 4

  // OTHER POST PROCESSING TASKS
  // done loading: only if there's text, clear the timer and hide loading
  if (splitText.length > 0) {
    clearInterval(loadingTimer)
    hideLoading()
  }

  // other non-processing tasks that are dependent on chunkSize
  // update wpm multiplier, depends on word chunk size
  updateWPMMultiplier()
}

// TODO: re-write this to use background storage
async function trackOpen(selectedText) {
  const storageCache = await initializeBackgroundStorage()
  const openMode = await storageCache.getSettingFromStorage(
    storageCache.OPEN_MODE
  )
  // send google analytic event based on open mode
  // console.log("open mode: ", openMode);
  let value
  switch (openMode) {
    case 0:
      value = 'button overlay'
      break
    case 1:
      value = 'alt+v auto text extraction'
      break
    case 2:
      value = 'alt+b text selector'
      break
    case 3:
      value = 'highlight text, alt+v'
      break
    case 4:
      value = 'highlight text, context menu'
      break
    case 5:
      value = 'browser action menu item' // DEPRECATED
      break
    case 6:
      value = 'pasted text'
      break
    case 7:
      value = 'open text selector from menu'
      break
    case 8:
      value = 'auto text extractor from menu'
      break
    case 9:
      value = 'kindle cloud button overlay'
      break
    case 10:
      value = 'native reader button'
      break
    case 11:
      value = 'context menu, full page'
      break
    case 12:
      value = 'save to app from menu'
      break
    case 13:
      value = 'save to app, hotkey'
      break

    default:
      value = 'unknown'
      break
  }
  // console.log("open mode value: ", value);

  pushEvent('spreed open mode', value)

  const numChars = selectedText.length
  trackEvent('Open', {
    'Open Mode': value,
    'Number of Characters': numChars ?? null,
  })
}

function getFilesInDirectory(directory) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', directory)
    xhr.onload = () => {
      if (xhr.status !== 200) {
        reject('Unable to fetch directory')
      }
      const files = []
      Array.prototype.forEach.call(
        xhr.responseXML.querySelectorAll('a'),
        (element) => {
          const href = element.getAttribute('href')
          if (href) {
            files.push(href)
          }
        }
      )
      resolve(files)
    }
    xhr.onerror = () => {
      reject('Unable to fetch directory')
    }
    xhr.responseType = 'document'
    xhr.send()
  })
}

async function handleSaveToApp(selectedText) {
  console.log('In handleSaveToApp...')

  const backgroundStorage = await initializeBackgroundStorage()
  const toSaveToApp = backgroundStorage.getSetting(
    backgroundStorage.SAVE_TO_APP_ON_READER_OPEN
  )
  console.log('Saving this content to app: ', toSaveToApp)
  if (!toSaveToApp) return

  let savingToast = Toastify({
    text: 'Saving page to app...',
    duration: null,
    close: true,
    onClick: function () {}, // Callback after click
  }).showToast()

  try {
    // first, get current window id
    const currentTab = await chrome.tabs.getCurrent()
    if (!currentTab) {
      throw new Error('Could not get current tab')
    }

    // make sure user is authed
    console.log('Authing app user...')
    const authResponse = await chrome.runtime.sendMessage({
      action: 'authAppUser',
      windowId: currentTab.windowId,
    })
    if (!authResponse.success) {
      throw new Error(authResponse.error)
    }
    if (!authResponse.session) {
      // if no session was returned but auth flow was completed, show error toast to user
      Toastify({
        text: '⚠️ Sign in not complete, page not saved to app.',
        duration: 5000,
        close: true,
        stopOnFocus: true,
        className: 'warning',
        onClick: () => {
          handleSaveToApp(selectedText)
        },
      }).showToast()
      // reset save to app on reader open
      await backgroundStorage.setSetting(
        backgroundStorage.SAVE_TO_APP_ON_READER_OPEN,
        false
      )
      savingToast.hideToast()
      return
    }
    console.log('App user is authed with session: ', authResponse.session)

    // upload selectedText to app "imports" bucket
    const importResponse = await chrome.runtime.sendMessage({
      action: 'importToApp',
      data: selectedText,
      url: curUrl,
      title: currentTitle,
    })
    if (!importResponse.success) {
      throw new Error(importResponse.error)
    }
    let contentId = importResponse.contentId

    // reset save to app on reader open
    await backgroundStorage.setSetting(
      backgroundStorage.SAVE_TO_APP_ON_READER_OPEN,
      false
    )
    // hide saving toast
    setTimeout(() => {
      savingToast.hideToast()
    }, 1500)

    // show success toast
    const constants = await chrome.runtime.sendMessage({
      action: 'getConstants',
    })
    if (!constants.success) {
      throw new Error("Unable to get app's constants")
    }
    Toastify({
      text: '✅ Success! Saved page to app. Click here to open',
      duration: 5000,
      close: true,
      stopOnFocus: true,
      className: 'success',
      destination: constants.APP_URL,
      newWindow: true,
    }).showToast()
  } catch (error) {
    console.error('Error saving to app:', error)
    let errorMessage = error.message ?? error

    alert(
      'Error saving to app, please report to help@swiftread.com: \n\n' +
        errorMessage
    )
    await backgroundStorage.setSetting(
      backgroundStorage.SAVE_TO_APP_ON_READER_OPEN,
      false
    )
    savingToast.hideToast()
    return
  }
}

function fixSelectedText(selectedText) {
  // make any necessary fixes to any selected text (from any source) before parsing out tokens
  function addSpaceAfterPeriods(inputString) {
    return inputString.replace(/([A-Za-z]+)\.([A-Z]+)/g, '$1. $2')
  }
  let fixedSelectedText = addSpaceAfterPeriods(selectedText)
  return fixedSelectedText
}

async function loadReader() {
  const storageCache = await initializeBackgroundStorage()
  keepRaw = await storageCache.getSettingFromStorage(storageCache.KEEP_RAW)

  var settingsStore = new SettingsStore()
  console.log('initializing settings store...')

  await settingsStore.isInitialized

  console.log('settings store initialized.')
  state.settingsStore = settingsStore

  // init
  // alert('actual init');
  inits += 1

  // set timer to check on time it takes to process the text
  startLoadingTimer()

  trackOpen(selectedText)
  // console.log("selectedText: ", selectedText); // TODO: comment this out before release to save memory
  // console.log("selectedText length:", selectedText.length);
  handleSaveToApp(selectedText)

  //set max wpm
  maxWpm = 2000

  /*
   *
   * Set up content handlers (e.g. for page turn, getting current location string, etc.)
   *
   */

  // for read.amazon
  // console.log('currentDomain: ', currentDomain)
  let hasContentHandler = false
  const urlType = getUrlType(currentDomain)
  if (currentDomain && urlType === UrlType.KindleCloudReader) {
    const contentHandler = new KindleCRContentHandler(
      spreedTabId,
      currentTabId,
      state,
      storageCache,
      (nextPageSelectedText) => {
        selectedText = nextPageSelectedText
        // re-process text
        processAndPrepareText((resetWordIndex = true))
      }
    )
    hasContentHandler = true
  }
  // set up page turn buttons, but for PDF reader
  else if (currentDomain && urlType === UrlType.PdfReader) {
    const contentHandler = new PDFContentHandler(spreedTabId, currentTabId)
    hasContentHandler = true
  }
  // set up page turn buttons, but for epub reader
  else if (currentDomain && urlType === UrlType.EpubReader) {
    const contentHandler = new EpubContentHandler(spreedTabId, currentTabId)
    hasContentHandler = true
  } else if (!currentDomain) {
    // currentDomain is empty
    // TODO: this fires a bunch, curUrl is null/empty. is this a problem?
    // update: *curUrl* should rarely be empty after some refactoring, but currentDomain may still be null...
    pushEvent('error', 'currentDomain-is-null', currentDomain)
  }

  // get user settings
  // forceUpdate the user: talk to server, query database, get any new pro features
  unlockProFeatures(true)

  //assign hotkeys
  reloadAppHotkeys()

  // micropauses
  getMicropauseSettings()
  // wpm interval
  getWPMInterval()
  // auto page turn settings
  getAutoPageTurnSettings()
  // focus indicator
  getFocusLetterIndicatorSettings(true)
  // listen
  getListenSettings(true)

  // reading start timer
  getTimerDelay()

  //font size
  fontSize = 60 //in pixels
  fontSize = parseInt(_localStorageSetdefault('font-size', fontSize))

  fontSizeDiv = document.getElementById('font-size')
  fontSizeDiv.innerHTML = fontSize
  // colors and font
  updateCustomStyleElements()
  if (highlightMode === true) {
    $('#word-container').addClass('highlight')
  }

  // wpm
  wpm = settingsStore.getSetting(settingsStore.SETTING_WPM)
  // console.log("setting wpm: ", wpm);

  // text scroller
  getTextScrollerStatusDisplay()

  // set upgrade button
  setUpgradeButton()

  //count days
  //do it locally
  today = new Date()
  prevDate = localStorage.getItem('prevDate')
  dayCount = localStorage.getItem('dayCount')
  if (prevDate == null && dayCount == null) {
    //console.log('setting defaults');
    prevDate = today.toString()
    dayCount = 0
  }

  today = today.toString()
  //console.log('today: '+today+', prevDate: '+prevDate);
  //console.log('today: '+Date.parse(today)+', prevDate: '+Date.parse(prevDate));

  diff = dateDiffInDays(Date.parse(prevDate), Date.parse(today))
  //console.log('diff: '+diff);
  dayCount = parseInt(dayCount) + diff
  localStorage.setItem('dayCount', dayCount)
  localStorage.setItem('prevDate', today)
  //console.log(dayCount);

  //because so much logic depends on chunk size, can't sync/callback logic screwy
  try {
    chunkSize = settingsStore.getSetting(settingsStore.SETTING_CHUNK_SIZE)
    if (chunkSize > 0) {
      // console.log('using STORED chunkSize: ', chunkSize);
    } else {
      chunkSize = 1
      // console.log('using default chunkSize: ', chunkSize);
    }
  } catch (err) {
    chunkSize = 1 //default. TODO: set by language
    // console.log('using default chunkSize: ', chunkSize);
  }
  chunkSizeDiv = document.getElementById('chunk-size')
  chunkSizeDiv.innerHTML = chunkSize

  pauseButton = document.getElementById('pause')
  pauseButton.style.display = 'none'

  resetButton = document.getElementById('reset')
  rewindButton = document.getElementById('rewind')
  forwardButton = document.getElementById('forward')

  //add play/pause button listeners
  playButton = document.getElementById('play')
  playButton.addEventListener('click', play, false)

  pauseButton.addEventListener('click', pause, false)
  resetButton.addEventListener('click', reset, false)
  rewindButton.addEventListener('click', rewind, false)
  forwardButton.addEventListener('click', forward, false)

  // handle fullscreen
  document
    .getElementById('fullscreen')
    .addEventListener('click', toggleFullScreen, false)
  function isFullscreen() {
    const screen = window.screen
    // console.log('screen size:', screen.width, screen.height)
    // console.log('screen avail size:', screen.availWidth, screen.availHeight)
    // console.log('window size:', window.innerWidth, window.innerHeight)

    const screenHeight = screen.availHeight
    const screenWidth = screen.availWidth
    const windowHeight = window.innerHeight
    const windowWidth = window.innerWidth

    return windowHeight >= screenHeight && windowWidth >= screenWidth
  }
  const fullScreenWarning = Toastify({
    text: '⚠️ Page turning may not work properly when in full-screen. Please click the "Maximize" button in the bottom right instead.',
    duration: -1,
    close: true,
    className: 'warning',
  })
  window.addEventListener('resize', function () {
    // TODO: check if there are page turn buttons too
    if (isFullscreen() && hasContentHandler) {
      fullScreenWarning.showToast()
    } else {
      fullScreenWarning.hideToast()
    }
  })

  listenButton = document.getElementById('listen')
  // listenButton.addEventListener("click", handleListenButtonClick, false); // do not allow clicking on the icon
  listenButton.addEventListener(
    'mouseenter',
    () => {
      // turn off notification
      localStorage.setItem('listenButtonHasNotification', 'false')
      listenButton.querySelector('.notification-icon').style.display = 'none'
    },
    false
  )
  if (listenButtonHasNotification === true) {
    listenButton.querySelector('.notification-icon').style.display = 'block'
  }

  //add increase/decrease listeners
  document
    .getElementById('increase-wpm')
    .addEventListener('click', increaseWPM, false)
  document
    .getElementById('decrease-wpm')
    .addEventListener('click', decreaseWPM, false)

  document
    .getElementById('increase-font-size')
    .addEventListener('click', increaseFontSize, false)
  document
    .getElementById('decrease-font-size')
    .addEventListener('click', decreaseFontSize, false)

  document
    .getElementById('increase-chunk-size')
    .addEventListener('click', increaseChunkSize, false)
  document
    .getElementById('decrease-chunk-size')
    .addEventListener('click', decreaseChunkSize, false)

  //document.getElementById('small-donate-link').addEventListener("click",donateClick,false);
  //document.getElementById('small-review-link').addEventListener("click",reviewClick,false);

  // add listener for save button
  async function saveToAppAllowed() {
    const saveToAppEnabled = await checkFeatureIsEnabled('save-to-app')
    if (!saveToAppEnabled) {
      return false
    }
    const response = await chrome.runtime.sendMessage({
      action: 'saveToAppAllowed',
      url: currentDomain,
    })
    return response.allowed
  }
  const saveToAppAllowedBool = await saveToAppAllowed()
  const saveControl = document.getElementById('save-control')
  const saveGroup = document.getElementById('save-group')
  if (saveToAppAllowedBool) {
    saveGroup.style.display = 'inline-block'
    saveControl.addEventListener(
      'click',
      async function () {
        pushEvent('spreed-app-control', 'click-save')
        await storageCache.setSetting(
          storageCache.SAVE_TO_APP_ON_READER_OPEN,
          true
        )
        handleSaveToApp(selectedText)
      },
      false
    )
  } else {
    saveGroup.style.display = 'none'
  }

  // add listener for statistics button
  document.getElementById('statistics-open').addEventListener(
    'click',
    function () {
      pushEvent('spreed-app-control', 'click-statistics')
      openStatistics('statistics_control')
    },
    false
  )

  // add mouse-in listeners to show/hide controls
  addMouseListenersToToggleControls()

  //put focus on the play button
  playButton.focus()

  // track extension version to GA
  loadManifest((response) => {
    // Parse JSON string into object
    let manifestJson = JSON.parse(response)
    // track open event
    let proString = 'free'
    if (getUserLicense() !== null) {
      proString = 'pro'
    }
    pushEvent('version-on-app-page-view', manifestJson.version, proString)
  })

  // PROCESS AND PREPARE TEXT
  processAndPrepareText()

  // set up ui that depends on text
  renderWPM()

  // set up context
  updateContextDisplayStyle((initial = true))
  setUpContextDisplay()

  // threshold for sharing buttons to appear
  articleShareThreshold = Math.round((splitText.length - 1) * 1)
  //console.log('articleShareThreshold: '+articleShareThreshold);

  // threshold for auto extract next page
  extractNextPageThreshold = Math.round((splitText.length - 1) * 1)

  // add help popup div (after hotkeys have been loaded)
  addHelpDiv()

  // open onboarding tutorial
  openOnboardingTutorial()

  // on reader open analytics
  // check if curUrl includes the string swiftread.com/reading-speed-test
  if (
    currentTabId &&
    curUrl &&
    curUrl.includes('swiftread.com/reading-speed-test')
  ) {
    // console.log('curUrl includes swiftread.com/reading-speed-test...');
    // send message to content script to write data to reading-speed-test page
    getPlayAnalyticsData().then((data) => {
      // console.log('sending message to content script to write data to page');
      data['opened_at'] = new Date().toISOString()
      chrome.tabs.sendMessage(
        currentTabId,
        { action: 'writeDataToReadingTest', data },
        function (response) {}
      )
    })
  }

  // start auto-read timer, which is default off
  if (timerDelay !== null) {
    playButton.style.display = 'none'
    // start the auto-read timer
    startTimer(timerDelay)
  }
}

async function checkFeatureIsEnabled(featureId) {
  const response = await chrome.runtime.sendMessage({
    action: 'isFeatureEnabled',
    featureId,
  })
  return response.result
}
async function init() {
  // console.log("in init function: ");

  const storageCache = await initializeBackgroundStorage()

  //tokenize selected text (make sure there's stuff in it too)

  // reset congrats div box text
  $('#congrats').html('')
  $('#post-reading-status').fadeOut('fast')

  let checkInterval = 50
  let timeElapsed = 0

  // show loading spinner after a small delay
  showLoadingSpinner()

  // TODO: show loading error if it's taking too long
  // showLoadingError("Timed out while waiting for extracted text from page");

  const storedSelectedText = await storageCache.getSettingFromStorage(
    storageCache.SELECTED_TEXT
  )

  if (
    storedSelectedText &&
    storedSelectedText != '' &&
    typeof storedSelectedText !== 'undefined'
  ) {
    // load the reader immediately if selected text is defined
    const fixedSelectedText = fixSelectedText(storedSelectedText)
    selectedText = fixedSelectedText
    await loadReader()
  }
  // add a chrome storage listener for when selected text goes from undefined to defined
  chrome.storage.onChanged.addListener(async function (changes, namespace) {
    for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
      // handle certain storage keys changing
      switch (key) {
        case 'selectedText':
          const storedSelectedText = newValue
          if (
            storedSelectedText &&
            storedSelectedText != '' &&
            typeof storedSelectedText !== 'undefined' &&
            typeof oldValue === 'undefined'
          ) {
            console.log('selectedText is now newly defined')
            console.log('selectedText from storage:', selectedText)

            selectedText = storedSelectedText
            await loadReader()
          }
          break

        default:
          break
      }
    }
  })
}

function showLoadingError(errorMsg) {
  $('#error-message').html(`
		<div><i style='color: #ffc837; font-size: 2rem;' class='fas fa-exclamation-triangle'></i></div>
		<div><p style='color: #ffc837;'>SwiftRead had trouble extracting text on this page, make sure the page actually has text on it. Error message: ${errorMsg}. Send me a <a href="https://swiftread.com/help" target="_blank">message</a> with this error and the URL of the page.</p></div>`)
  $('#error-message').css('top', '150px')
  $('#error-message').css('font-size', '16px')
  $('#error-message').css('font-weight', '700')
  $('#error-message').show()

  pushEvent('error', 'no-selectedText-timeout', curUrl ? curUrl : 'null_curUrl')
}
function showLoadingSpinner() {
  $('#error-message').css('opacity', 0)
  $('#error-message').html(`
			<div>
				<i style="font-size: 2rem;" class="fas fa-circle-notch fa-spin"></i>
			</div>
			<div>
				<p style="font-size: 1rem;">No text detected yet, does this page have text?</p>
			</div>`)
  $('#error-message').show()
  $('#error-message').delay(500).animate({ opacity: '1' }, 500)
}
function hideLoading() {
  $('#error-message').html()
  $('#error-message').hide()
}
function showInProgressIndicator() {
  if ($('#in-progress').css('display') !== 'inline-block') {
    $('#in-progress').css('display', 'inline-block')
  }
}
function hideInProgressIndicator() {
  if ($('#in-progress').css('display') !== 'none') {
    $('#in-progress').css('display', 'none')
  }
}

function _removeEmpty(splitText) {
  var newSplitText = new Array()

  for (var i = 0; i < splitText.length; i = i + 1) {
    token = splitText[i]
    if (!isEmpty(token)) {
      newSplitText.push(token)
    }
  }
  return newSplitText
}

var waitUntil = function (fn, condition, interval) {
  interval = interval || 100

  var shell = function () {
    var timer = setInterval(function () {
      var check

      try {
        check = !!condition(timer)
      } catch (e) {
        check = false
      }

      if (check) {
        clearInterval(timer)
        fn()
      }
    }, interval)
  }

  return shell
}

var waitUntilPromise = function (
  condition,
  interval,
  timeout,
  timeoutMessage = null
) {
  const timerInterval = interval || 100
  const timerTimeout = timeout || 10000
  const timerTimeoutMessage = timeoutMessage
  let count = 0

  return new Promise((resolve, reject) => {
    let timer = setInterval(function () {
      let check

      try {
        check = !!condition(timer)
      } catch (e) {
        check = false
      }

      if (check) {
        clearInterval(timer)
        resolve()
      }

      count += timerInterval

      if (count > timerTimeout) {
        clearInterval(timer)
        reject(timerTimeoutMessage)
      }
    }, timerInterval)
  })
}

function startTimer(delay) {
  //console.log('startTimer: '+delay);
  $('#word-container-timer').css('width', delay * 100 + 'px')
  timerBorderWidth = delay * 100

  timerCountdown = setInterval(function () {
    countdown()
  }, 1000)

  timerTimeout = setTimeout(function () {
    clearInterval(timerCountdown)
    play()
  }, delay * 1000)
}

function countdown() {
  //decrease width of
  timerBorderWidth -= 100
  $('#word-container-timer').css('width', timerBorderWidth + 'px')
}

function getMatchBounds(match) {
  return {
    match: match[0],
    length: match[0].length,
    index: match.index,
    indexEnd: match.index + match[0].length - 1,
  }
}
function processWord(word) {
  // console.log('---');
  // console.log('processing word:', word);

  // determine highlight center and add span
  var divisor = 2
  let charOffset = 0
  // console.log('language:', language);
  if (language === 0 || language === 1) {
    // if language is english or chinese/japanese
    divisor = 2
    // if english, add a 1 character offset too
    if (language === 0) charOffset = 1
  } else {
    divisor = 2.5
  }

  // create temp element with word only, no styles
  let tmp = document.createElement('DIV')
  tmp.innerHTML = word

  let wordContent = tmp.textContent || tmp.innerText || ''
  // console.log('wordContent before trim:', wordContent);
  wordContent = wordContent.trim()
  // console.log('wordContent after trim:', wordContent);

  // find center based on real displayed word
  var center = Math.max(
    Math.round(wordContent.length / divisor - 1) - charOffset,
    0
  )
  // console.log('center:', center);

  // reconstruct "word"/chunk with center highlighted
  // split on every character
  var letters = word.split('')

  // DEAL WITH SPECIAL HTML CHARACTERS
  // get all special character positions
  let specialTokenMatches = []

  const tagMatches = [...word.matchAll(tagR)].map(getMatchBounds)
  // console.log('tagMatches:',tagMatches);
  specialTokenMatches = specialTokenMatches.concat(tagMatches)

  const ltgtMatches = [...word.matchAll(/\&[l|g]t\;/gi)].map(getMatchBounds)
  // console.log('ltgtMatches:', ltgtMatches);
  specialTokenMatches = specialTokenMatches.concat(ltgtMatches)

  const nbspMatches = [...word.matchAll(/\&nbsp\;/gi)].map(getMatchBounds)
  // console.log('nbspMatches:', nbspMatches);
  specialTokenMatches = specialTokenMatches.concat(nbspMatches)

  const ampMatches = [...word.matchAll(/\&amp\;/gi)].map(getMatchBounds)
  // console.log('ampMatches:', ampMatches);
  specialTokenMatches = specialTokenMatches.concat(ampMatches)

  const whitespaceMatches = [...word.matchAll(/\s/gi)].map(getMatchBounds)
  // console.log('whitespaceMatches:', whitespaceMatches);
  specialTokenMatches = specialTokenMatches.concat(whitespaceMatches)

  // console.log('specialTokenMatches:', specialTokenMatches);

  // iterate through every letter in the entire styled chunk, finding the center of the "real" word
  // and ignoring any special tokens. add the highlight tag span to the center letter so that the letter is visually highlighted AND centered
  let idxCount = 0
  let newWord = []
  for (let i = 0; i < letters.length; i++) {
    const letter = letters[i]

    const curMatches = specialTokenMatches.filter(
      (x) => i >= x.index && i <= x.indexEnd
    )
    // console.log('curMatches:', curMatches);

    if (curMatches.length === 0) {
      // if this letter isn't inside a special token
      if (idxCount === center) {
        newWord.push('<span class="highlight">' + letter + '</span>')
      } else {
        newWord.push(letter)
      }
      idxCount += 1
    } else {
      newWord.push(letter)
    }
  }

  return newWord.join('')
}

function positionWord() {
  // console.log('--- position word ---');

  const preMLContext = document.getElementById(
    'pre-multiline-context-container'
  )
  const postMLContext = document.getElementById(
    'post-multiline-context-container'
  )

  // clear word and context if there's no splitText
  if (splitText.length === 0) {
    preMLContext.innerHTML = ''
    postMLContext.innerHTML = ''
    return
  }

  //var wordEl = $('#word').get();
  // console.log('position word');

  var wordEl = $('#context-container #context').get(0) // instead, use context
  // console.log('#word:',wordEl);

  var readerEl = document.getElementById('word-container')

  const contextContainer = $('#context-container').get(0)
  const contextCurrent = document.getElementById('context')

  // contextContainer.style.backgroundColor = 'purple';
  let activeHighlight = $(contextCurrent).find('.active .highlight').get(0)
  if (typeof activeHighlight === 'undefined') {
    activeHighlight = $(contextCurrent).find('.active').get(0)
  }
  // activeHighlight.style.backgroundColor = 'green';

  // reposition top of active word
  const halfWordHeight = activeHighlight.getBoundingClientRect().height / 2
  // console.log('readerEl:', readerEl);
  const readerY = readerEl.getBoundingClientRect().y
  // console.log('readerY:', readerY);
  const readerHeight = readerEl.getBoundingClientRect().height
  // console.log('readerHeight:', readerHeight);

  var centerOffsetY = halfWordHeight + activeHighlight.offsetTop
  const newWordTop = readerEl.clientHeight / 2 - centerOffsetY
  wordEl.style.top = newWordTop + 'px'

  $(wordEl).offset({
    top: readerY + readerHeight / 2 - halfWordHeight,
  })
  // console.log('new word top:', newWordTop);

  // horizontally position (center on highlight) context
  // console.log('activeHighlight: ', activeHighlight);
  // console.log('activeHighlight.offsetLeft: ', activeHighlight.offsetLeft);
  // console.log('activeHighlight.offsetWidth: ', activeHighlight.offsetWidth);

  const highlightOffset =
    activeHighlight.offsetLeft + activeHighlight.offsetWidth / 2
  // console.log('highlightOffset:', highlightOffset);
  // console.log('readerEl.offsetWidth: ', readerEl.offsetWidth);

  let leftOffset = readerEl.offsetWidth / 2 - highlightOffset
  // reposition left of context line if right-only context is enabled
  if (contextFromRightEnabled === true) {
    const halfReaderWidth = readerEl.getBoundingClientRect().width / 2
    leftOffset =
      leftOffset - activeWordOffsetFromCenterPctOfHalfWidth * halfReaderWidth
  }
  // console.log('leftOffset:', leftOffset);
  // console.log('wordEl: ', wordEl);
  wordEl.style.left = leftOffset + 'px'
  // console.log('word style top:', wordEl.style.top); // after going to single line context, this looks fine
  // console.log('word y:', wordEl.getBoundingClientRect().y); // after going to single line context, this looks highly negative...

  // highlight
  highlightCenterVisualOnly()

  //update slider
  slider.slider('value', wordIndex)

  // update time estimate
  updateTimeEstimate()

  // FOCUS INDICATORS
  // reposition focus indicators
  // vertically position guides
  const focusIndicatorHeight = focusLetterIndicatorEnabled === true ? 50 : 25
  const topFocusIndicator = document.getElementById('top-focus-indicator')
  const bottomFocusIndicator = document.getElementById('bottom-focus-indicator')
  if (focusLetterIndicatorEnabled === true) {
    topFocusIndicator.style.display = 'block'
    bottomFocusIndicator.style.display = 'block'
    // console.log('enabling focus letter...');
  } else {
    topFocusIndicator.style.display = 'none'
    bottomFocusIndicator.style.display = 'none'
    // console.log('hiding focus letter...');
  }

  const topFocusIndicatorY =
    contextCurrent.getBoundingClientRect().y -
    topFocusIndicator.getBoundingClientRect().height -
    focusIndicatorHeight / 2
  $(topFocusIndicator).offset({
    top: topFocusIndicatorY,
  })

  const bottomFocusIndicatorY =
    contextCurrent.getBoundingClientRect().y +
    contextCurrent.getBoundingClientRect().height +
    focusIndicatorHeight / 2
  $(bottomFocusIndicator).offset({
    top: bottomFocusIndicatorY,
  })
  // horizontally position indicator
  // assumes horizontal position of indicator should be at center and stay there
  const highlightedLetterWidth = activeHighlight.getBoundingClientRect().width
  const topFocusIndicatorBounds = topFocusIndicator.getBoundingClientRect()
  // console.log('topFocusIndicator bounds: ', topFocusIndicatorBounds);

  const focusIndicatorMarkLeft =
    topFocusIndicatorBounds.x + topFocusIndicatorBounds.width / 2
  // console.log('focusIndicatorMarkLeft: ', focusIndicatorMarkLeft);

  $(topFocusIndicator).find('.focus-indicator-mark').offset({
    left: focusIndicatorMarkLeft,
  })
  $(bottomFocusIndicator).find('.focus-indicator-mark').offset({
    left: focusIndicatorMarkLeft,
  })

  // MULTILINE CONTEXT FUNCTIONALITY
  // detect which words in context line are on/off the wordContainer
  // console.log('readerEl:', readerEl.getBoundingClientRect());
  const contextLineStartWords = Array.from(
    document
      .getElementById('context-line-start')
      .querySelectorAll('.context-word')
  )
  // console.log('contextLineStartWords:', contextLineStartWords);
  const contextLineEndWords = Array.from(
    document
      .getElementById('context-line-end')
      .querySelectorAll('.context-word')
  )
  // console.log('contextLineEndWords:', contextLineEndWords);

  // words fully visible in context start
  const pageTurnButtonBuffer = 30
  const inlineContextStartWords = contextLineStartWords.map((wordEl) => {
    if (
      wordEl.getBoundingClientRect().x <
      readerEl.getBoundingClientRect().x + pageTurnButtonBuffer
    ) {
      return false
    } else {
      return true
    }
  })
  // words fully visible in context end
  const inlineContextEndWords = contextLineEndWords.map((wordEl) => {
    const wordElBounds = wordEl.getBoundingClientRect()
    const readerElBounds = readerEl.getBoundingClientRect()
    if (
      wordElBounds.x + wordElBounds.width >
      readerElBounds.x + readerElBounds.width - pageTurnButtonBuffer
    ) {
      return false
    } else {
      return true
    }
  })
  // turn words in inline context off/on depending on if they're fully visible
  inlineContextStartWords.map((isVisible, i) => {
    if (isVisible === false || contextFromRightEnabled === true)
      contextLineStartWords[i].style.opacity = 0
  })
  inlineContextEndWords.map((isVisible, i) => {
    if (isVisible === false) contextLineEndWords[i].style.opacity = 0
  })
  // move words that aren't visible to pre/post multi line context containers
  function sanitizeWordElForMLContext(wordEl) {
    let outerHTML = wordEl.outerHTML
    // remove any styles
    outerHTML = outerHTML.replaceAll(/style=".*?"(.*?\>)/g, '$1')
    return outerHTML
  }

  let preMLContextHTML = contextLineStartWords
    .filter((_, i) => !inlineContextStartWords[i])
    .map((wordEl) => {
      return sanitizeWordElForMLContext(wordEl)
    })
    .join(' ')
  // PRE-CONTEXT DISPLAY TRANSFORMERS
  // replace all "start p" spans with two line breaks to denote new paragraph
  preMLContextHTML = preMLContextHTML.replaceAll(
    /\<span class=.{1}start p.{1}\>\<\/span\>/g,
    '<br/>'
  )
  // replace all "end p" spans with two line breaks to denote new paragraph
  preMLContextHTML = preMLContextHTML.replaceAll(
    /\<span class=.{1}end p.{1}\>\<\/span\>/g,
    '<br/>'
  )
  // replace all "end h*" spans with two line breaks to denote new paragraph
  preMLContextHTML = preMLContextHTML.replaceAll(
    /\<span class=.{1}end h\d?.{1}\>\<\/span\>/g,
    '<br/>'
  )
  preMLContext.innerHTML = preMLContextHTML

  let postMLContextHTML = contextLineEndWords
    .filter((_, i) => !inlineContextEndWords[i])
    .map((wordEl) => {
      return sanitizeWordElForMLContext(wordEl)
    })
    .join(' ')
  // POST-CONTEXT DISPLAY TRANSFORMERS
  // replace all "start p" spans with two line breaks to denote new paragraph
  postMLContextHTML = postMLContextHTML.replaceAll(
    /\<span class=.{1}start p.{1}\>\<\/span\>/g,
    '<br/>'
  )
  // replace all "end p" spans with two line breaks to denote new paragraph
  postMLContextHTML = postMLContextHTML.replaceAll(
    /\<span class=.{1}end p.{1}\>\<\/span\>/g,
    '<br/><br/>'
  )
  // replace all "end h*" spans with two line breaks to denote new paragraph
  preMLContextHTML = preMLContextHTML.replaceAll(
    /\<span class=.{1}end h\d?.{1}\>\<\/span\>/g,
    '<br/>'
  )
  postMLContext.innerHTML = postMLContextHTML
  // reposition pre/post context containers
  const preMLContextY =
    contextCurrent.getBoundingClientRect().y -
    preMLContext.getBoundingClientRect().height -
    focusIndicatorHeight
  $(preMLContext).offset({
    top: preMLContextY,
  })

  const postMLContextY =
    contextCurrent.getBoundingClientRect().y +
    contextCurrent.getBoundingClientRect().height +
    focusIndicatorHeight
  $(postMLContext).offset({
    top: postMLContextY,
  })

  // set up multi-line context click listeners
  const contextWords = $('.multiline-context .context-word')
  $(contextWords).on('click', function (e) {
    e.preventDefault()
    wordIndex = $(this).data('word-index')
    movePacerToWordIndexUserInitiated(wordIndex)
  })

  // console.log('---');
}

function sanitizeContextArray(words, startWordIndex) {
  // console.log('words:', words);
  return words.map((word, i) => {
    // remove some breaking tags that surround every word
    word = word.replaceAll(/\<br\/+\>/g, '')
    word = word.replaceAll(/\<\/p\>/g, '')
    word = word.replaceAll(/\<p.*?\>/g, '')

    // remove the extraneous highlight span
    word = word.replaceAll(
      /\<span class=.{1}highlight.{1}>(.*?)\<\/span\>/g,
      '$1'
    )
    // add context-word around every word
    word = `<span class='context-word' data-word-index='${
      i + startWordIndex
    }'>${word}</span>\n`
    return word
  })
}
function setUpContextDisplay() {
  // console.log('current word:', splitText[wordIndex]);
  const contextCurrent = document.getElementById('context')

  // reset context if there's no splitText
  if (typeof splitText === 'undefined' || splitText.length === 0) {
    contextCurrent.innerHTML = ''
    return
  }

  const currentSplitTextWord = splitText[wordIndex]
  // if there isn't a word at the current index, return as it probably means we're done reading
  if (typeof currentSplitTextWord === 'undefined') {
    return
  }

  const activeChunkString = currentSplitTextWord
    .replaceAll('<br>', '')
    .replaceAll('<br/>', '')
  // console.log('activeChunkString:',activeChunkString);

  const contextNumWords = 150
  const contextChunkSize = Math.floor(contextNumWords / chunkSize)
  let preContextString
  if (wordIndex === 0) {
    preContextString = ''
  } else if (wordIndex > 0) {
    const preContextStartIndex = Math.max(0, wordIndex - contextChunkSize - 1)
    const preContextEndIndex = wordIndex
    preContextString = sanitizeContextArray(
      splitText.slice(preContextStartIndex, preContextEndIndex),
      preContextStartIndex
    ).join(' ')
    // console.log('preContextString:\n',preContextString);
  }

  let postContextString
  if (wordIndex < splitText.length - 1) {
    const postContextStartIndex = wordIndex + 1
    const postContextEndIndex = Math.min(
      splitText.length - 1,
      wordIndex + 1 + contextChunkSize
    )
    postContextString = sanitizeContextArray(
      splitText.slice(postContextStartIndex, postContextEndIndex + 1),
      postContextStartIndex
    ).join(' ')
    // console.log('postContextString:\n',postContextString);
  } else {
    postContextString = ''
  }

  // construct context string
  const fullContextString = `<span class="context" id="context-line-start">${preContextString}</span><span class="active">${activeChunkString}</span><span class="context" id="context-line-end">${postContextString}</span>`
  // console.log('fullContextString:',fullContextString);
  contextCurrent.innerHTML = fullContextString

  // hide context if supposed to be hidden
  if (contextDisplayStyle === 'never') {
    $('.context, .multiline-context').css('display', 'none')
  } else {
    if (enableMultilineContext === true) {
      $('.context').css('display', 'inline-block')
      $('.multiline-context').css('display', 'inline-block')
    } else {
      $('.context').css('display', 'inline-block')
      $('.multiline-context').css('display', 'none')
    }

    if (contextDisplayStyle === 'on-pause' && hide > 0) {
      $('.context, .multiline-context').css('opacity', 0)
    }
  }
}

function renderWPM() {
  if (listenEnabled === false) {
    updateWPMMultiplier()
  } else {
    wpmDiv.innerHTML = audioWPM
  }

  updateTimeEstimate()
}

function updateTimeEstimate() {
  let wpmToUse
  if (listenEnabled === true) {
    wpmToUse = audioWPM
  } else {
    wpmToUse = wpm
  }
  // console.log('update time estimate with total words, words left, wpm: ', rawSplitText.length, wordIndex + 1, wpmToUse);

  timeEstimate = (rawSplitText.length - (wordIndex + 1)) / wpmToUse
  // console.log("time estimate: ", timeEstimate, rawSplitText.length, (wordIndex + 1));
  timeEstimate = Math.round(timeEstimate * 10) / 10
  // console.log("rounded: ", timeEstimate);

  if (timeEstimate < 1 && timeEstimate > 0) timeString = '< 1'
  else if (timeEstimate <= 0) timeString = '0'
  else timeString = Math.round(timeEstimate).toString()

  $('#time-estimate').html(timeString + ' min')
}

function updateWPMMultiplier() {
  if (chunkSize > 1) {
    wpmDiv = document.getElementById('wpm')
    wpmDiv.innerHTML = wpm + '&#8202;&#215;&#8202;' + chunkSize
  } else if (chunkSize === 1) {
    wpmDiv = document.getElementById('wpm')
    wpmDiv.innerHTML = wpm
    //console.log(wpmDiv.innerHTML);
  }
}

function isEmpty(str) {
  return !str || 0 === str.length
}

function rewind() {
  movePacer(-2)
}
function forward() {
  movePacer(2)
}
function movePacer(seconds) {
  rewindAmount = Math.floor((wpm / 60 / chunkSize) * seconds)
  const newWordIndex = rewindAmount + wordIndex
  if (!splitText[newWordIndex]) {
    // trying to move to non-existent word, do nothing
    return
  }

  wordIndex = newWordIndex
  if (wordIndex < 0) {
    wordIndex = 0
    setCurrentFirstTokenIndex()
  }
  //console.log('rewinding '+rewindAmount);

  //display word
  setUpContextDisplay()

  wordDiv.innerHTML = splitText[wordIndex]
  positionWord()

  afterClick()

  if (listenEnabled === true) {
    seekToCurrentWordIndexInAudio(wordIndex)
  }
}

function movePacerToWordIndexUserInitiated(wordIndex, ignoreAudio = false) {
  if (listenEnabled === true && !ignoreAudio) {
    seekToCurrentWordIndexInAudio(wordIndex)
  }
  movePacerToWordIndex(wordIndex)
}
function movePacerToWordIndex(wordIndex) {
  setCurrentFirstTokenIndex()
  setUpContextDisplay()

  wordDiv.innerHTML = splitText[wordIndex]
  positionWord()
}

function reset() {
  if (state.isPlaying === true) {
    pause()
  }

  // reset reading time
  currentTimeSpent = 0

  wordIndex = 0
  movePacerToWordIndexUserInitiated(wordIndex)
}
async function getPlayAnalyticsData() {
  return new Promise(async (resolve, reject) => {
    try {
      // see if the data we need to track exists at this point
      // console.log('wpm: ', wpm);
      // console.log('audioWPM: ', audioWPM);
      // console.log('listenEnabled: ', listenEnabled);
      // console.log('chunkSize: ', chunkSize);
      let numChars = selectedText.length
      // console.log('numChars: ', numChars);
      let numWords = nonChunkedSplitText.length
      // console.log('numWords: ', numWords);
      let language = await getLanguage(selectedText)
      // console.log('language: ', language);
      let clientId = await getClientId()
      // console.log('clientId: ', clientId);
      let licenseKey = getUserLicense()
      // console.log('licenseKey: ', licenseKey);

      resolve({
        wpm,
        audioWPM,
        listenEnabled,
        chunkSize,
        numChars,
        numWords,
        language,
        clientId,
        licenseKey,
      })
    } catch (err) {
      reject(err)
    }
  })
}
function play() {
  if (!splitText[wordIndex]) {
    // trying to move to non-existent word, do nothing (e.g. while at end of document)
    return
  }
  // // timing helper //
  // lastFunctionExecTime = null;

  resetCongrats()

  // hide controls
  hideControls()

  //start reading timer
  readingTimer = setInterval(function () {
    incrementReadingTimer()
  }, 1000)
  state.isPlaying = true

  clearInterval(timerCountdown)
  clearTimeout(timerTimeout)
  $('#word-container-timer').css('width', '0px')

  // visual speed reading
  if (listenEnabled === false) {
    delay = (1 / (wpm / 60)) * 1000 - FUNCTION_EXECUTION_DISCOUNT_MS

    wordTimer = setInterval(function () {
      nextWord()
    }, delay)
  } else {
    // listen is enabled, so play audio and also pace through words visually
    playAudio(wordIndex)
  }

  //disable play, enable pause
  playButton.style.display = 'none'

  pauseButton.style.display = ''

  // track play
  trackEvent('Play')

  // track play analytics event
  getPlayAnalyticsData().then((data) => {
    trackAnalyticsEvent('play', data)
  })
}

function openStatistics(campaign) {
  chrome.tabs.create({
    url:
      'statistics.html?utm_source=extension&utm_medium=internal&utm_campaign=' +
      campaign,
  })
  setTimeout(function () {
    close()
  }, 200)
}

function handleListenButtonClick() {
  // temporary: disallow enabling listen if listen enabled while chunk size > 1
  if (chunkSize > 1) {
    alert(
      `Listening to the text isn't available yet for more than one word at a time! Please change the "Words at a time" setting to 1 and try enabling the audio again.\n\nIf you have any questions or would like to see this functionality, send me a message at swiftread.com/help`
    )
    trackEvent('Attempt to Enable Listen with Multi-word Chunk', { chunkSize }) // TODO: remove this event after test concludes
    return
  }

  // change listenEnabled state and play if appropriate
  toggleListenEnabled()
}

////STATS////

function incrementReadingTimer() {
  /*
	chrome.storage.sync.get("totalTimeSpent", function(items) {
		if (_dictIsEmpty(items)) {
			//if doesn't exist, set to default
			chrome.storage.sync.set({"totalTimeSpent":0}, function() {});
		}
		else {
			totalTimeSpent = items['totalTimeSpent'];
			totalTimeSpent += 1;
			chrome.storage.sync.set({"totalTimeSpent":totalTimeSpent}, function() {});
			console.log(totalTimeSpent);
		}

	});
	*/

  totalTimeSpent += 1
  localStorage.setItem('totalTimeSpent', totalTimeSpent)
  //console.log(totalTimeSpent);

  //also keep track of current time spent reading
  currentTimeSpent += 1
}

function countWord(inputWordIndex = null) {
  let wordIndexToUse
  if (inputWordIndex !== null) {
    wordIndexToUse = inputWordIndex
  } else {
    wordIndexToUse = wordIndex
  }

  const wordsRead = splitTextIndexes[wordIndexToUse].length
  wordCount += wordsRead
  currentWordCount += wordsRead
  // console.log('just read this many words, have now read this many words in session: ', wordsRead, currentWordCount);

  localStorage.setItem('wordCount', wordCount)
  // console.log(wordCount);
}

function syncCountStats() {
  //sync word count and time spent from local vars to google chrome.sync
}

function secondsToString(seconds) {
  var numdays = Math.floor(seconds / 86400)
  var numhours = Math.floor((seconds % 86400) / 3600)
  var numminutes = Math.floor(((seconds % 86400) % 3600) / 60)
  var numseconds = ((seconds % 86400) % 3600) % 60
  if (numdays > 0) {
    return (
      numdays +
      ' days, ' +
      numhours +
      ' hours, ' +
      numminutes +
      ' minutes, ' +
      numseconds +
      ' seconds'
    )
  } else if (numhours > 0) {
    return (
      numhours +
      ' hours, ' +
      numminutes +
      ' minutes, ' +
      numseconds +
      ' seconds'
    )
  } else {
    return numminutes + ' minutes, ' + numseconds + ' seconds'
  }
}

function resetCongrats() {
  $('#post-reading-status').fadeOut('fast')
  $('#congrats').html('')
}

function showCongrats() {
  var existingCongrats = $('#congrats').html()
  var congratsMessage = generateRandomCongrats()
  existingCongrats +=
    congratsMessage +
    ' You just read ' +
    String(currentWordCount) +
    ' words in ' +
    String(secondsToString(currentTimeSpent)) +
    '! <br><br><u>Enjoying SwiftRead? Write us a review!</u>'
  $('#congrats').css('cursor', 'pointer')
  $('#congrats').on('click', function (e) {
    chrome.tabs.create({ url: homepageUrl }, function (tab) {
      chrome.windows.update(tab.windowId, { focused: true })
    })
    pushEvent('spreed-app-link', 'post-read-write-review')
  })
  $('#congrats').html(existingCongrats)
  $('#post-reading-status').fadeIn('slow')

  // show social share too
  $('#share-spreed-fb').show('slow')
}

function doneReadingPage() {
  // see if we should auto-turn to the next page
  if (
    autoTurnPage === true &&
    $('#page-turn-container').css('display') !== 'none'
  ) {
    // pause reader but keep controls hidden
    pause((keepControlsHidden = true))
    // go to the next page
    $('#page-turn-right a').trigger('click')
    // after page is turned, play again
    waitUntilPromise(
      function () {
        return !!(wordIndex === 0)
      },
      50,
      5000,
      'Auto page turn timed out'
    )
      .then(() => {
        play()
      })
      .catch((err) => {
        console.warn(err)
        pause()
      })
  } else {
    pause()

    //show congratulations div after we're done reading but only for non-multi-page
    if ($('#page-turn-container').css('display') === 'none') {
      showCongrats()
    }
  }
}
//// next word
function nextWord(first) {
  // // timing helper //
  // const startAt = Date.now();
  // console.log(startAt, '---start: nextWord function---');
  // if (lastFunctionExecTime !== null) {
  // 	betweenFunctionExecTimes.push(startAt - lastFunctionExecTime);
  // }

  countWord()

  // calculate base delay
  delay = (1 / (wpm / 60)) * 1000

  first = typeof first !== 'undefined' ? first : 0

  // MOVE ONTO NEXT WORD
  wordIndex = wordIndex + 1

  if (wordIndex >= splitText.length) {
    doneReadingPage()
  } else {
    // CONTINUE READING
    //console.log(wordIndex);

    // set the universal index of the first word in this chunk, for state tracking
    setCurrentFirstTokenIndex()

    // START WORD DISPLAY
    // set up context display FIRST
    setUpContextDisplay()

    // get the "raw" word (no html tags), to use later to determine micropuases
    // also next word for the same purpose
    curWordToken = rawSplitText[wordIndex]
    curWordHTML = splitText[wordIndex]
    curChunkTextIndexes = splitTextIndexes[wordIndex]
    if (wordIndex + 1 < rawSplitText.length) {
      nextWordToken = rawSplitText[wordIndex + 1]
      nextWordHTML = splitText[wordIndex + 1]
      nextChunkTextIndexes = splitTextIndexes[wordIndex + 1]
    } else {
      nextWordToken = undefined
      nextWordHTML = undefined
      nextChunkTextIndexes = []
    }

    // console.log('curChunkTextIndexes:',curChunkTextIndexes);
    let curChunkTextArray = curChunkTextIndexes.map(
      (i) => nonChunkedSplitText[i]
    )
    // console.log('curChunkTextArray:',curChunkTextArray);
    let nextChunkTextArray = nextChunkTextIndexes.map(
      (i) => nonChunkedSplitText[i]
    )
    var doesNextMatch = function (
      curChunkArray,
      nextChunkArray,
      chunkSize,
      matchRegex
    ) {
      // if chunk size is 1:
      // check current chunk, if matches but beyond first character, return to pause
      // otherwise, check the next chunk, and if it matches but at the first position, return true to pause on current chunk
      let curChunkText = curChunkArray.join('')
      let nextChunkText = nextChunkArray.join('')
      // console.log('curChunkText:',curChunkText);
      // console.log('nextChunkText:',nextChunkText);
      // console.log('matchRegex:',matchRegex);

      let curChunkMatch = curChunkText.match(matchRegex)
      let nextChunkMatch = nextChunkText.match(matchRegex)
      // console.log('curChunkMatch:',curChunkMatch);
      // console.log('nextChunkMatch:',nextChunkMatch);

      if (curChunkMatch && curChunkMatch.index > 0) {
        // console.log('above matches, returning true');
        return true
      } else if (nextChunkMatch && nextChunkMatch.index === 0) {
        // console.log('above matches, returning true');
        return true
      }

      return false
    }

    // #word div gets populated, but isn't shown if context is active
    wordDiv.innerHTML = splitText[wordIndex]
    positionWord()

    // TIMING
    bonus = 0

    // micropausing is enabled, but check to see if individual micro-pause types are
    enablemicropause = 'true'

    if (enablemicropause == 'true') {
      // MICRO PAUSING

      //if contains a number
      var numbers_re =
        /(?:^|\s)(\d*\.?\d+|\d{1,4}(?:,\d{1,4})*(?:\.\d+)?)(?!\S)/g
      var numbers_matched = curWordToken.match(numbers_re)
      var bonus_factor
      // console.log(numbers_matched);
      if (numbers_matched && enablemicropauseNumbers === true) {
        numbers_matched = numbers_matched.join('')
        // console.log('match: ', numbers_matched);
        // console.log('----')
        // console.log('numbers matched length: ', numbers_matched.length);
        // console.log('micropauseNumbersFactor: ', micropauseNumbersFactor);
        // pause constant amount for displayed numbers larger than 1000
        bonus_factor =
          (Math.round((numbers_matched.length - 1) / 3.0) > 0 ? 1 : 0) *
          micropauseNumbersFactor
        // console.log('bonus_factor: ', bonus_factor);
        bonus = delay * bonus_factor
        // console.log('bonus: ',bonus);
        // console.log('delay: ',delay);
      } else {
        if (enablemicropausePunctuation === true) {
          let openParensRegex = /<?.*?>?\(/ // open parens right after any html tags
          let endingPunctuationRegex = /[\.\!\?]/
          let otherPunctuationRegex = /[\,\;\:\)]/

          // if not a number but contains ending punctuation
          if (curWordToken.match(endingPunctuationRegex)) {
            bonus_factor = micropauseEndingPunctuationFactor
            // console.log('ending punctuation bonus_factor: ', bonus_factor);
            bonus = delay * bonus_factor
            // console.log('bonus:',bonus);
          }
          // otherwise, if it contains the "other" punctuation
          else if (curWordToken.match(otherPunctuationRegex)) {
            bonus_factor = micropausePunctuationFactor
            // console.log('other punctuation bonus_factor: ', bonus_factor);
            bonus = delay * bonus_factor
            // console.log('bonus:',bonus);
          }
          // otherwise, detect if NEXT word has any symbols that should cause us to pause on the current word
          else if (
            doesNextMatch(
              curChunkTextArray,
              nextChunkTextArray,
              chunkSize,
              openParensRegex
            )
          ) {
            bonus_factor = micropausePunctuationFactor
            bonus = delay * bonus_factor

            // console.log('!!! pausing on this word, because open parens coming');
            // console.log('curChunkTextArray:',curChunkTextArray);
            // console.log('nextChunkTextArray:',nextChunkTextArray);
            // console.log('chunkSize:',chunkSize);
            // console.log('bonus:',bonus);
          }
        }
      }

      //delay longer words that are not numbers: add to any existing delay
      if (
        curWordToken.length > 8 * chunkSize &&
        enablemicropauseLongWords === true &&
        numbers_matched === null
      ) {
        bonus_factor =
          Math.ceil(curWordToken.length / (8 * chunkSize)) *
          micropauseLongWordsFactor
        // console.log('bonus_factor: ', bonus_factor);
        bonus = bonus + delay * bonus_factor

        // bonus = bonus + ((curWordToken.length - (6*chunkSize))/(8*chunkSize) * delay);
      }

      // end of paragraph delay: add to any existing delay
      // console.log('enablemicropauseParagraph:',enablemicropauseParagraph);
      if (enablemicropauseParagraph === true) {
        // check if we should micropause on this word becaue next character is a new paragraph
        // console.log('---');
        // console.log('curChunkTextArray:',curChunkTextArray);
        // console.log('nextChunkTextArray:',nextChunkTextArray);
        // console.log('chunkSize:',chunkSize);
        if (
          doesNextMatch(
            curChunkTextArray,
            nextChunkTextArray,
            chunkSize,
            /<br\/>/
          ) ||
          doesNextMatch(
            curChunkTextArray,
            nextChunkTextArray,
            chunkSize,
            /<span class=\'end [p|h]/
          )
        ) {
          // console.log('!!! pausing because new paragraph is about to start.');
          // console.log('curChunkTextArray:',curChunkTextArray);
          // console.log('nextChunkTextArray:',nextChunkTextArray);
          // console.log('chunkSize:',chunkSize);

          bonus_factor = micropauseParagraphFactor
          bonus = bonus + delay * bonus_factor
        }
      }
    }

    // console.log(curWordToken);
    // console.log(curWordToken.length);

    // console.log('delay: ' + delay);
    // console.log('bonus: ' + bonus);

    clearInterval(wordTimer)
    if (chunkSize * wpm <= 100) {
      bonus = 0
    }
    wordTimer = setTimeout(function () {
      nextWord()
    }, delay + bonus - FUNCTION_EXECUTION_DISCOUNT_MS)
  }

  //console.log("#container width: "+$("#container").width());
  //console.log("#word-continer width: "+$("#word-container").width());

  // // timing helper //
  // const endAt = Date.now();
  // console.log(endAt, '---end: nextWord function---');
  // functionExecTimes.push(endAt - startAt);
  // lastFunctionExecTime = endAt;
}

function donateClick() {
  //chrome.tabs.create({url:'https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=7BDUJ9WFCEPLG'});
  //chrome.tabs.create({ url: homepageUrl });
}
function reviewClick() {
  //chrome.tabs.create({url:'https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=7BDUJ9WFCEPLG'});
  chrome.tabs.create({ url: homepageUrl })
}

function pause(keepControlsHidden = false) {
  // if listen
  if (listenEnabled === true) {
    pauseCurrentAudio()
  }

  //stop reading timer
  clearInterval(readingTimer)
  state.isPlaying = false

  clearInterval(wordTimer)
  playButton.style.display = ''

  pauseButton.style.display = 'none'

  if (keepControlsHidden === false) {
    showControls()
  }
}

function increaseWPM() {
  // console.log('increasing WPM...');
  let interval = wpmInterval

  if (listenEnabled === false) {
    if (wpm + interval <= maxWpm) {
      //console.log("increase");
      wpm = wpm + interval
      wpmDiv.innerHTML = wpm

      state.settingsStore.setSetting(state.settingsStore.SETTING_WPM, wpm)
    } else {
      console.warn(
        `wpm not increased to ${
          wpm + interval
        } from ${wpm}, max wpm is ${maxWpm} and wpm interval is ${interval}`
      )
    }
  } else {
    if (audioWPM + interval <= maxWpm) {
      // increment audio WPM setting
      setAudioWPM(audioWPM + interval)
    } else {
      console.warn(
        `audio WPM not increased to ${
          audioWPM + interval
        } from ${audioWPM}, max wpm is ${maxWpm} and wpm interval is ${interval}`
      )
    }
  }
  renderWPM()
  afterClick()
}

function decreaseWPM() {
  // console.log('decreasing WPM...');
  let interval = wpmInterval

  if (listenEnabled === false) {
    if (wpm - interval > 0) {
      wpm = wpm - interval
      wpmDiv.innerHTML = wpm

      state.settingsStore.setSetting(state.settingsStore.SETTING_WPM, wpm)
    } else {
      console.warn(
        `wpm not decreased to ${
          wpm - interval
        } from ${wpm}, wpm must be > 0 and wpm interval is ${interval}`
      )
    }
  } else {
    if (audioWPM - interval > 0) {
      // decrement audio WPM setting
      setAudioWPM(audioWPM - interval)
    } else {
      console.warn(
        `audio WPM not decreased to ${
          audioWPM - interval
        } from ${audioWPM}, wpm must be > 0 and wpm interval is ${interval}`
      )
    }
  }
  renderWPM()
  afterClick()
}

function setFontSize(obj, value) {
  obj.css('font-size', value + 'px')
}

function increaseFontSize() {
  if (fontSize + 5 < 455) {
    fontSize = fontSize + 5
    fontSizeDiv.innerHTML = fontSize

    updateCustomStyleElements()

    //_setStorage({"font-size":fontSize});
    localStorage.setItem('font-size', fontSize)
  }
  setUpContextDisplay()
  positionWord()
  afterClick()
}

function decreaseFontSize() {
  if (fontSize - 5 >= 5) {
    fontSize = fontSize - 5
    fontSizeDiv.innerHTML = fontSize

    updateCustomStyleElements()

    //_setStorage({"font-size":fontSize});
    localStorage.setItem('font-size', fontSize)
  }
  setUpContextDisplay()
  positionWord()
  afterClick()
}

function increaseChunkSize() {
  // console.log('increasing chunk size...');

  // temporary: do not allow chunk size to be increased to more than 1 if listen is enabled
  if (chunkSize + 1 > 1 && listenEnabled === true) {
    alert(
      `Listening to the text isn't available yet for more than one word at a time! Please disable the audio in SwiftRead first before increasing the "Words at a time" setting.\n\nIf you have any questions or would like to see this functionality, send me a message at swiftread.com/help`
    )
    trackEvent('Attempt to Increase Chunk Size with Listen Enabled') // TODO: remove this event after test concludes
    return
  }

  if (chunkSize + 1 <= 6) {
    if (state.isPlaying === true) pause()

    chunkSize = chunkSize + 1
    console.log('new chunkSize: ', chunkSize)
    chunkSizeDiv.innerHTML = chunkSize
    state.settingsStore.setSetting(
      state.settingsStore.SETTING_CHUNK_SIZE,
      chunkSize
    )

    processAndPrepareText((resetWordIndex = true))
  } else {
    console.log(
      `WARNING: chunk size not increased to ${
        chunkSize + 1
      }, max chunk size is 6`
    )
  }
  afterClick()
}

function decreaseChunkSize() {
  // console.log('decreasing chunk size...');

  if (chunkSize - 1 >= 1) {
    if (state.isPlaying === true) pause()

    chunkSize = chunkSize - 1
    chunkSizeDiv.innerHTML = chunkSize
    state.settingsStore.setSetting(
      state.settingsStore.SETTING_CHUNK_SIZE,
      chunkSize
    )

    processAndPrepareText((resetWordIndex = true))
  } else {
    console.log(
      `WARNING: chunk size not decreased to ${
        chunkSize - 1
      }, min chunk size is 1`
    )
  }
  afterClick()
}

$.fn.removeClassRegex = function (regex) {
  return $(this).removeClass(function (index, classes) {
    return classes
      .split(/\s+/)
      .filter(function (c) {
        return regex.test(c)
      })
      .join(' ')
  })
}

function getHighlightSettings() {
  highlightMode =
    getSetting(state.settingsStore.SETTING_HIHGLIGHT_ENABLED_KEY) === 'true'
      ? true
      : false
  // console.log('highlightMode:', highlightMode);
  highlightColorUseCustom =
    getSetting(state.settingsStore.SETTING_HIGHLIGHT_COLOR_USE_CUSTOM_KEY) ===
    'true'
      ? true
      : false
  // console.log('highlightColorUseCustom:', highlightColorUseCustom);
  if (highlightColorUseCustom === true) {
    // use custom color
    highlightColor = getSetting(state.settingsStore.SETTING_HIHGLIGHT_COLOR_KEY)
  } else {
    // use color scheme color
    const [colorSchemes, colorSchemeName] = returnColorSchemeData()

    // console.log(colorSchemes[colorSchemeName]);
    highlightColor =
      colorSchemes[colorSchemeName][
        state.settingsStore.SETTING_COLOR_SCHEME_HIGHLIGHT_COLOR_KEY
      ]
  }
  // console.log('highlightColor:',highlightColor);
}
function highlightCenterVisualOnly() {
  if (highlightMode === true) {
    $('#word .highlight').css({ color: highlightColor })
    $('#context .active .highlight').css({ color: highlightColor })
  } else {
    $('#word .highlight').css({ color: '' })
    $('#context .active .highlight').css({ color: '' })
  }
}
function highlightCenter() {
  getHighlightSettings()
  highlightCenterVisualOnly()
}

function returnColorSchemeData() {
  const colorSchemes = getSetting(state.settingsStore.SETTING_COLOR_SCHEMES_KEY)
  let colorSchemeName = getSetting(
    state.settingsStore.SETTING_CURRENT_COLOR_SCHEME_KEY
  )
  if (typeof colorSchemes[colorSchemeName] === 'undefined') {
    // somehow ended up with a non-existent color scheme, so set to default
    colorSchemeName = state.settingsStore.DEFAULT_COLOR_SCHEME
    state.settingsStore.setSetting(
      state.settingsStore.SETTING_CURRENT_COLOR_SCHEME_KEY,
      colorSchemeName
    )
  }
  return [colorSchemes, colorSchemeName]
}
function returnFontData() {
  const fonts = getSetting(state.settingsStore.SETTING_FONTS_KEY)
  let fontKey = getSetting(state.settingsStore.SETTING_CURRENT_FONT_KEY)
  if (typeof fonts[fontKey] === 'undefined') {
    // somehow ended up with a non-existent font name
    fontKey = state.settingsStore.DEFAULT_FONT
    state.settingsStore.setSetting(
      state.settingsStore.SETTING_CURRENT_FONT_KEY,
      fontKey
    )
  }
  return [fonts, fontKey]
}
function getCustomFontBackgroundSettings() {
  // color scheme colors
  const [colorSchemes, colorSchemeName] = returnColorSchemeData()
  // console.log('setting app color scheme:',colorSchemeName);

  // use custom colors?
  backgroundColorEnabled =
    getSetting(state.settingsStore.SETTING_BACKGROUND_COLOR_ENABLED_KEY) ===
    'true'
      ? true
      : false
  fontColorEnabled =
    getSetting(state.settingsStore.SETTING_FONT_COLOR_ENABLED_KEY) === 'true'
      ? true
      : false

  if (backgroundColorEnabled === true) {
    // custom colors override
    backgroundColor = getSetting(
      state.settingsStore.SETTING_BACKGROUND_COLOR_KEY
    )
  } else {
    backgroundColor =
      colorSchemes[colorSchemeName][
        state.settingsStore.SETTING_COLOR_SCHEME_BACKGROUND_COLOR_KEY
      ]
  }
  // set it as the preload background color
  localStorage.setItem(PRELOAD_BACKGROUND_COLOR_KEY, backgroundColor)

  if (fontColorEnabled === true) {
    // custom colors override
    fontColor = getSetting(state.settingsStore.SETTING_FONT_COLOR_KEY)
  } else {
    fontColor =
      colorSchemes[colorSchemeName][
        state.settingsStore.SETTING_COLOR_SCHEME_FONT_COLOR_KEY
      ]
  }

  // fonts
  const [fonts, fontKey] = returnFontData()
  const fontData = fonts[fontKey]
  font = `${fontData[state.settingsStore.SETTING_FONT_NAME_KEY]}, ${
    fontData[state.settingsStore.SETTING_FONT_BACKUP_KEY]
  }`
  // console.log('setting word font:', font);

  // letter spacing
  letterSpacing = getSetting(state.settingsStore.SETTING_LETTER_SPACING_KEY)
  // console.log("setting letter spacing:", letterSpacing);
}

function getContextOpacitySetting() {
  contextOpacity = getSetting(state.settingsStore.SETTING_CONTEXT_OPACITY_KEY)
}
function updateCustomStyleElements() {
  // update custom colors
  getCustomFontBackgroundSettings()

  // update center letter highlight
  highlightCenter()

  // get other custom styling settings
  getContextOpacitySetting()

  // console.log('setting custom styles:');
  // console.log(backgroundColor);
  // console.log(fontColor);

  const customStyles = `
	<style id='custom-styles'>
		body {
			${'background: ' + backgroundColor + ';'}
			${'color: ' + fontColor + ';'}
		}
		body #status .config-group a:hover {
			${'color: ' + fontColor + ';'}
		}
		body #status .svg-arrow .svg-path {
			${'fill: ' + fontColor + ';'}
		}

    body #status .button {
      ${'border-color: ' + fontColor + ';'}
			${'color: ' + fontColor + ';'}
		}
		body #slider {
			${'background: ' + fontColor + ';'}
		}
		body #slider .ui-slider-handle {
			${'background: ' + fontColor + ';'}
			${'border-color: ' + backgroundColor + ';'}
		}
		body #word-container-timer {
			${'border-bottom:3px solid ' + fontColor + ';'}
		}
		body #word-container {
			font-family: ${font};
		}
		body #cboxContent {
			${'background: ' + backgroundColor + ';'}
		}
		#context-container {
			font-family: ${font};
			font-size: ${fontSize}px;
      letter-spacing: ${letterSpacing}px;
		}
		#context-container #context {
			line-height: ${fontSize}px;
		}
		#context-container #context .context, .multiline-context {
			opacity: ${contextOpacity};
		}
		.focus-indicator {
			opacity: ${contextOpacity};
			${'border-color: ' + fontColor + ';'}
		}
		.focus-indicator .focus-indicator-mark {
			${'background-color: ' + fontColor + ';'}
		}

	</style>
	`
  if ($('head style#custom-styles').length > 0) {
    $('head style#custom-styles').remove()
  }
  $('head').append(customStyles)

  setTimeout(function () {
    $('#page-turn .page-turn-direction').css('background', backgroundColor)
    $('#page-turn > #page-turn-left').css(
      'box-shadow',
      '5px 0px 5px ' + backgroundColor
    )
    $('#page-turn > #page-turn-right').css(
      'box-shadow',
      '-5px 0px 5px ' + backgroundColor
    )
  }, 100)
}

function afterClick() {
  //un focus currently focused element
  if ('activeElement' in document) document.activeElement.blur()
}

// on window resize or drag/position change, save the window dimensions and position
async function saveWindowDimensions() {
  const curWindowWidth = window.outerWidth
  const curWindowHeight = window.outerHeight
  const curWindowX = window.screenLeft
  const curWindowY = window.screenTop

  if (curWindowWidth !== windowWidth) {
    windowWidth = curWindowWidth
    const backgroundStorage = await initializeBackgroundStorage()
    backgroundStorage.setSetting(
      backgroundStorage.READER_WINDOW_WIDTH,
      windowWidth
    )
    setUpContextDisplay()
    positionWord()
  }
  if (curWindowHeight !== windowHeight) {
    windowHeight = curWindowHeight
    const backgroundStorage = await initializeBackgroundStorage()
    backgroundStorage.setSetting(
      backgroundStorage.READER_WINDOW_HEIGHT,
      windowHeight
    )
    setUpContextDisplay()
    positionWord()
  }
  if (curWindowX !== windowX) {
    windowX = curWindowX
    const backgroundStorage = await initializeBackgroundStorage()
    backgroundStorage.setSetting(backgroundStorage.READER_WINDOW_X, windowX)
    setUpContextDisplay()
    positionWord()
  }
  if (curWindowY !== windowY) {
    windowY = curWindowY
    const backgroundStorage = await initializeBackgroundStorage()
    backgroundStorage.setSetting(backgroundStorage.READER_WINDOW_Y, windowY)
    setUpContextDisplay()
    positionWord()
  }

  // console.log('Saved reader window dimensions, width, height, x, y: ', windowWidth, windowHeight, windowX, windowY);
}
setInterval(() => {
  saveWindowDimensions()
}, 1000)

async function toggleFullScreen(event = null) {
  console.log('full screen toggled')
  if (event !== null) {
    event.preventDefault()
    pushEvent('spreed-app-action', 'click-fullscreen')
  } else {
    pushEvent('spreed-app-action', 'hotkey-fullscreen')
  }

  const currentWindow = await chrome.windows.getCurrent()
  if (!state.isFullscreen) {
    // it's not full screen so make it full screen

    // but first keep track of the current window dimensions
    state.unmaximizedWindow.width = window.outerWidth
    state.unmaximizedWindow.height = window.outerHeight
    // and also the current window position
    state.unmaximizedWindow.x = currentWindow.left
    state.unmaximizedWindow.y = currentWindow.top

    // maximize current window
    chrome.windows.update(currentWindow.id, {
      state: 'maximized',
    })

    // change the icon to compress
    document.getElementById('fullscreen').innerHTML =
      '<i class="fas fa-compress"></i>'
    state.isFullscreen = true
  } else {
    // it is full screen so reduce its size to original
    chrome.windows.update(currentWindow.id, {
      width: state.unmaximizedWindow.width ?? 800,
      height: state.unmaximizedWindow.height ?? 600,
      left: state.unmaximizedWindow.x ?? 0,
      top: state.unmaximizedWindow.y ?? 0,
    })

    // change the icon back to expand
    document.getElementById('fullscreen').innerHTML =
      '<i class="fas fa-expand"></i>'
    state.isFullscreen = false
  }
}

function setHide(set) {
  var hideElements = $(selectorsToHide)
  if (contextDisplayStyle === 'on-pause') {
    hideElements = $(`${selectorsToHide}, ${contextSelectors}`)
  }

  hide = set

  if (hide == 0) {
    //show everything
    hideElements.css('opacity', '') // remove inline opacity style to use default transparency settings
  } else {
    //hide everything
    hideElements.css('opacity', 0)
  }
}

function toggleHide() {
  if (hide == 0) hide = 1
  else hide = 0

  setHide(hide)
  localStorage.setItem('hide', hide)
}
function hideControls() {
  setHide(1)
}
function showControls() {
  setHide(0)
}

function checkKeypress(k, handler) {
  // // debug
  // console.log(k, handler);
  // console.log(k.keyCode);
  // console.log(String.fromCharCode(k.keyCode));
  // if (hotkeys.cmd) {
  //     console.log('cmd is pressed!');
  // }
  // if (hotkeys.command) {
  //    	console.log('command is pressed!');
  //  	}

  // seek to position in text
  if (k.keyCode >= 48 && k.keyCode <= 57) {
    number = parseInt(String.fromCharCode(k.keyCode))
    if (number == 0) number = 10
    pct = (number - 1) * 0.1

    //move word to % position
    wordIndex = Math.round(pct * (splitText.length - 1))
    setCurrentFirstTokenIndex()
    wordDiv.innerHTML = splitText[wordIndex]
    setUpContextDisplay()

    waitUntil(
      function () {
        // the code you want to run here...
        positionWord()
      },
      function () {
        // the code that tests here... (return true if test passes; false otherwise)
        return !!(wordDiv.innerHTML !== '')
      },
      50 // amount to wait between checks
    )()
  }
}

function addOnboardingTutorialProgressBar() {
  return new Promise((resolve, reject) => {
    // console.log('count changed: ', count);
    const tour = onboardingTutorial
    const currentStep = tour.getCurrentStep()
    // console.log('currentStep: ', currentStep);
    if (typeof currentStep !== 'undefined') {
      console.log('currentStep: ', currentStep)
      const currentStepElement = currentStep.getElement()
      // console.log('currentStepElement: ', currentStepElement);
      if (typeof currentStepElement !== 'undefined') {
        const footer = currentStepElement.querySelector('.shepherd-footer')
        // console.log('footer: ', footer);
        if (typeof footer !== 'undefined' && footer !== null) {
          const progressParent = document.createElement('div')
          progressParent.className = 'shepherd-progress-bar'

          const progressText = `${tour.steps.indexOf(currentStep)}/${
            tour.steps.length - 1
          }`
          const progressTextElement = document.createElement('div')
          progressTextElement.innerHTML = progressText
          progressParent.appendChild(progressTextElement)

          const progress = document.createElement('progress')
          //add class to the progress holder
          progress.className = 'progress is-info'
          // set value attribute for progress element
          const progressPercentage =
            (tour.steps.indexOf(tour.currentStep) / (tour.steps.length - 1)) *
            100
          progress.setAttribute('value', progressPercentage)
          progress.setAttribute('max', 100)
          progressParent.appendChild(progress)

          //skip adding progress bar to the first popup because it is a welcome dialog
          if (tour.steps.indexOf(tour.currentStep) !== 0) {
            // first, wrap any existing footer buttons in a div
            const footerButtons = footer.querySelectorAll('.shepherd-button')
            if (footerButtons.length > 0) {
              const footerButtonsWrapper = document.createElement('div')
              footerButtonsWrapper.className = 'shepherd-footer-buttons'
              footerButtons.forEach((button) => {
                footerButtonsWrapper.appendChild(button)
              })
              footer.appendChild(footerButtonsWrapper)
            }
            // append the progress element to the beginning of the footer
            footer.insertBefore(progressParent, footer.firstChild)
          }
        }
      }
    }

    resolve()
  })
}

function openOnboardingTutorial() {
  const forceFirstTime = false // DEBUG: set this to true to force the tutorial to show up

  onboardingTutorial = new Shepherd.Tour({
    defaultStepOptions: {
      cancelIcon: {
        enabled: true,
      },
      scrollTo: false,
      when: {
        show: () => {
          addOnboardingTutorialProgressBar()
        },
      },
    },
    useModalOverlay: false,
  })

  const tourSteps = [
    {
      id: 'start',
      text: `
			<p>
				<span class="animated wave">👋</span>&nbsp;<b>Welcome!</b>
			</p>
			<p>Follow these quick tips to start reading faster with SwiftRead.</p>
			`,
      attachTo: null,
      buttons: [
        {
          action() {
            return this.next()
          },
          classes: 'shepherd-button-primary',
          text: 'First tip &#8594;',
        },
      ],
    },
    {
      id: 'play',
      text: `
			<p>
				Press the Play button <i class="fas fa-play"></i> to start the reader. It will present the text to you in a way that allows you to read it more efficiently.
			</p>
			<div class="hint"><b>Hint:</b> You can Play/Pause the reader with the <kbd>Space</kbd> hotkey.</div>
			`,
      attachTo: {
        element: '#play',
        on: 'top-start',
      },
      buttons: [
        {
          action() {
            return this.back()
          },
          classes: 'shepherd-button-secondary',
          text: 'Back',
        },
        {
          action() {
            return this.next()
          },
          classes: 'shepherd-button-primary',
          text: 'Next',
        },
      ],
    },
    {
      id: 'wpm',
      text: `
			<p>
				Adjust the reading speed by changing the WPM (words per minute) value.
			</p>
			<div class="hint"><b>Pro-tip:</b> How fast should you go? Click the callibration icon <i class="fas fa-drafting-compass"></i> next to the WPM controls to callibrate your reading speed.</div>
			`,
      attachTo: {
        element: '#decrease-wpm',
        on: 'bottom-end',
      },
      buttons: [
        {
          action() {
            return this.back()
          },
          classes: 'shepherd-button-secondary',
          text: 'Back',
        },
        {
          action() {
            return this.next()
          },
          classes: 'shepherd-button-primary',
          text: 'Next',
        },
      ],
    },
    {
      id: 'settings',
      text: `
			<p>
				Click the Settings icon <i class="fas fa-cog"></i> to customize the colors, hotkeys, and much more.
			</p>
			`,
      attachTo: {
        element: '#settings-group',
        on: 'bottom-start',
      },
      buttons: [
        {
          action() {
            return this.back()
          },
          classes: 'shepherd-button-secondary',
          text: 'Back',
        },
        {
          action() {
            return this.next()
          },
          classes: 'shepherd-button-primary',
          text: 'Next',
        },
      ],
    },
    {
      id: 'end',
      text: `
			<p>
				That's enough to get you started! You can always come back to this tutorial by clicking the Help icon <i class="fas fa-question-circle"></i> in the top right corner.
			</p>
			<p class='hint'>Need help? Have feedback? Send me a <a href="https://swiftread.com/help" target="_blank">message</a> and I'll get back to you as soon as I can!</p>
			`,
      attachTo: null,
      buttons: [
        {
          action() {
            return this.back()
          },
          classes: 'shepherd-button-secondary',
          text: 'Back',
        },
        {
          action() {
            return this.next()
          },
          classes: 'shepherd-button-primary',
          text: '🎉 Finish',
        },
      ],
    },
  ]
  onboardingTutorial.addSteps(tourSteps)

  // open the onboarding tutorial if first time
  if (localStorage.getItem('notfirsttime') > 0 && forceFirstTime == false) {
    // do nothing
  } else {
    localStorage.setItem('notfirsttime', 1)
    console.log('is first time, opening onboarding tutorial...')
    onboardingTutorial.start()
  }
}

function generateRandomCongrats() {
  var randomInt = Math.floor(Math.random() * 5 + 1)
  switch (randomInt) {
    case 1:
      return 'Congratulations!'
      break
    case 2:
      return 'Nice!'
      break
    case 3:
      return 'Awesome!'
      break
    case 4:
      return 'Cool!'
      break
    case 5:
      return 'Wow!'
      break
  }
}

function unbindMouseWheelScroll() {
  $(window).unbind('mousewheel')
}
function bindMouseWheelTextScroll() {
  $(window).bind('mousewheel', function (e) {
    if (state.settingsShown === false) {
      //pause();
      if (e.originalEvent.wheelDelta > 0) {
        if (wordIndex < splitText.length - 1) wordIndex += 1
        setCurrentFirstTokenIndex()
      } else {
        if (wordIndex >= 1) wordIndex -= 1
        setCurrentFirstTokenIndex()
      }
      wordDiv.innerHTML = splitText[wordIndex]
      setUpContextDisplay()

      waitUntil(
        function () {
          // the code you want to run here...
          positionWord()
        },
        function () {
          // the code that tests here... (return true if test passes; false otherwise)
          return !!(wordDiv.innerHTML !== '')
        },
        50 // amount to wait between checks
      )()
    }
  })
}
function getTextScrollerStatusDisplay() {
  const textScrollerEnabled =
    state.settingsStore.getSetting(
      state.settingsStore.SETTING_TEXT_SCROLLER_ENABLED_KEY
    ) === 'true'
      ? true
      : false

  if (textScrollerEnabled === true) {
    // show text scroller
    $('#slider-container').css('opacity', '1')
    // add text scroller to selectorsToHide
    selectorsToHide = [
      ...selectorsToHide.split(',').map((x) => x.trim()),
      '#slider-container',
    ].join(', ')
    // enabled text scroller listeners
    bindMouseWheelTextScroll()
  } else {
    // hide text scroller
    $('#slider-container').css('opacity', '0')
    // remove text scroller from selectorsToHide
    selectorsToHide = selectorsToHide
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x !== '#slider-container')
      .join(', ')
    // disable text scroller listeners
    unbindMouseWheelScroll()
  }
  addMouseListenersToToggleControls()
}

function strip(html) {
  var tmp = document.createElement('DIV')
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ''
}

/* ON LOAD */
$(async function () {
  const storageCache = await initializeBackgroundStorage()

  // set global vars that require chrome API
  // homepage URL
  homePageUrl = chrome.runtime.getManifest().homepage_url
  // console.log('homepageUrl: ', homepageUrl);

  // track extension version to MP
  const extensionVersion =
    chrome.runtime.getManifest().version_name ??
    chrome.runtime.getManifest().version
  registerEventSuperProperty({ 'Extension Version': extensionVersion })

  // share code
  $('#share-spreed-fb').hide() // we will re-show this later
  // replace share links
  let originalShareEncodedUrl =
    'https%3A%2F%2Fchrome.google.com%2Fwebstore%2Fdetail%2Fswiftread-read-faster-lea%2Fipikiaejjblmdopojhpejjmbedhlibno'
  let newShareEncodedUrl = encodeURIComponent(homepageUrl)
  let shareHtml = $('#share-spreed-fb').html()
  shareHtml = shareHtml.replaceAll(originalShareEncodedUrl, newShareEncodedUrl)
  $('#share-spreed-fb').html(shareHtml)

  // METADATA: get the page's metadata that user is trying to swiftread
  curUrl = await storageCache.getSettingFromStorage(storageCache.CURRENT_URL)
  currentTitle = await storageCache.getSettingFromStorage(
    storageCache.CURRENT_TITLE
  )

  // try to get currentDomain and currentTabId, they could be null/undefined though
  currentDomain = await storageCache.getSettingFromStorage(
    storageCache.CURRENT_DOMAIN
  )
  currentTabId = await storageCache.getSettingFromStorage(
    storageCache.CURRENT_TAB_ID
  )
  console.log('------------------')
  console.log('Opening in SwiftRead:')
  console.log('Tab ID: ', currentTabId)
  console.log('Domain: ', currentDomain)
  console.log('URL: ', curUrl)
  console.log('Title: ', currentTitle)
  console.log('------------------')

  statsMode = 0 //we have to start displaying stats on loading

  /*

	//populate loading stats with time saved first
	wordCount = localStorage.getItem('wordCount');
	if (wordCount==null) {
		wordCount = 0;
	}
	totalTimeSpent = localStorage.getItem('totalTimeSpent');
	if (totalTimeSpent==null) {
		totalTimeSpent = 0;
	}
	wordCount = parseInt(wordCount);
	totalTimeSpent = parseInt(totalTimeSpent);
	*/

  //init: get loading stats from chrome sync
  //populate loading stats with time saved first
  wordCount = parseInt(_localStorageSetdefault('wordCount', 0))
  totalTimeSpent = parseInt(_localStorageSetdefault('totalTimeSpent', 0))

  init()
})

/* LICENSE KEY FUNCTIONS */
function resetUserFeatures() {
  // resets user setting handlers to non-pro
  const defaultFeatures =
    state.settingsStore.getDefaultSettings()[
      state.settingsStore.USER_SETTINGS_JSON_KEY
    ]
  state.settingsStore.setSetting(
    state.settingsStore.USER_SETTINGS_JSON_KEY,
    defaultFeatures
  )
}
function resetUserFeatureValues() {
  // reset all setting *values* to their default values
  const defaultSettings = state.settingsStore.getDefaultSettings()
  console.log('defaultSettings:', defaultSettings)
  Object.entries(defaultSettings).map(([key, value]) => {
    state.settingsStore.setSetting(key, value)
  })
}
function resetUserLicense() {
  // resets the user's license to non-pro
  state.settingsStore.setSetting(state.settingsStore.USER_LICENSE_KEY, null)
}
function getUserLicense() {
  return state.settingsStore.getSetting(state.settingsStore.USER_LICENSE_KEY)
}
function getDefaultUserFeatures() {
  return state.settingsStore.getDefaultSettings()[
    state.settingsStore.USER_SETTINGS_JSON_KEY
  ]
}
function getUserFeatures() {
  return state.settingsStore.getSetting(
    state.settingsStore.USER_SETTINGS_JSON_KEY
  )
}
function setUserLicense(licenseKey) {
  state.settingsStore.setSetting(
    state.settingsStore.USER_LICENSE_KEY,
    licenseKey
  )
}
function setUserFeatures(featuresJSON) {
  state.settingsStore.setSetting(
    state.settingsStore.USER_SETTINGS_JSON_KEY,
    featuresJSON
  )
}

function unlockProFeatures(forceUpdate = false) {
  const licenseKey = getUserLicense()
  const defaultFeatures = getDefaultUserFeatures()
  const curFeatures = getUserFeatures()

  // if license key is null
  if (licenseKey === null) {
    // use default feature json
    setUserFeatures(defaultFeatures)
    // console.log('null licenseKey, using default features');
  } else {
    // non-null license key but default features: try to get new features
    if (
      JSON.stringify(defaultFeatures).length ===
      JSON.stringify(curFeatures).length
    ) {
      // console.log('non-null licenseKey, but default features: querying for new features');
      requestUserSettingsJsonKey(licenseKey)
    }
    // non-null license key and non-default features: continue. unless we should force updated paid users
    else {
      if (forceUpdate === true) {
        // console.log('forcing update pro user settings');
        requestUserSettingsJsonKey(licenseKey)
      }
      // console.log('non-null licenseKey and non-default features: continue as planned');
    }
  }
}
function requestUserSettingsJsonKey(
  licenseKey,
  otherSuccessCallback = null,
  otherFailureCallback = null
) {
  $.ajax({
    url: `${FIREBASE_FUNCTIONS_URL}getCustomerFeatures?license_key=${encodeURIComponent(
      licenseKey
    )}`,
    timeout: 5000,
  })
    .done(function (data) {
      // console.log('getCustomerFeatures data:', data);

      if (data.exists === true) {
        if (otherSuccessCallback !== null) {
          otherSuccessCallback()
        }

        const proSettingsJson = data.data
        setUserFeatures(proSettingsJson)
        setUserLicense(licenseKey)
      } else {
        // if no paid user found set to default feature settings
        // console.log('no user found, resetting');
        setUserFeatures(getDefaultUserFeatures())
        setUserLicense(null)

        if (otherFailureCallback !== null) {
          otherFailureCallback(
            {},
            'That license key is invalid. Did you enter it correctly?'
          )
        }
      }
    })
    .fail(function (error) {
      if (otherFailureCallback !== null) {
        otherFailureCallback(
          error,
          'Error communicating with server. Are you connected to the internet?'
        )
      } else {
        console.error(
          'Error communicating with server to update features. Try again later.'
        )
        console.error(error.status, error.statusText)
      }
    })
}

const loadManifest = (callback) => {
  let xobj = new XMLHttpRequest()
  xobj.overrideMimeType('application/json')
  xobj.open('GET', 'manifest.json', true)
  // Replace 'manifest' with the path to your file
  xobj.onreadystatechange = () => {
    if (xobj.readyState === 4 && xobj.status === 200) {
      // Required use of an anonymous callback
      // as .open() will NOT return a value but simply returns undefined in asynchronous mode
      callback(xobj.responseText)
    }
  }
  xobj.send(null)
}

// SET UP MESSAGE LISTENERS
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  // console.log('message received:',request);

  switch (request.action) {
    case 'reloadReader':
      ;(async () => {
        // console.log('reloadReader message received')
        const storageCache = await initializeBackgroundStorage()

        if (request.hasOwnProperty('extractedContent') === true) {
          await storageCache.setSetting(
            storageCache.SELECTED_TEXT,
            request.extractedContent
          )
        }

        sendResponse({
          success: true,
        })

        location.reload()
      })()
  }

  return true
})
