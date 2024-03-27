let ssmlParts // TODO: a typescript interface here would be nice
let wordIndexToSSMLPartIndexMap

let currentSSMLPartIndex

let audioWPM
let audioPlaybackRate

// array to keep track of the playback rate that was played last
// used in algorithm to determine the next allowable playback rate
let lastAudioPlaybackRate
const MAX_ALLOWABLE_PLAYBACK_RATE_DIFFERENCE_PCT = 0.15

let voiceId

let periodicCurrentTimeChecker

function resetListenState() {
  const wasPlaying = state.isPlaying
  if (wasPlaying === true) {
    pause()
  }

  currentSSMLPartIndex = undefined

  if (typeof periodicCurrentTimeChecker !== 'undefined') {
    clearInterval(periodicCurrentTimeChecker)
  }
}

const TIMEUPDATE_LISTENER_KEY = 'timeupdate'
const ENDED_LISTENER_KEY = 'ended'
const LOADED_METADATA_LISTENER_KEY = 'loadedmetadata'

// 2023-03-06: need sentence by sentence SSML splitting due to Google TTS API limitations
const SSML_PART_SOFT_LIMIT = isProduction === false ? 40 : 40 // look for a chance to break up the SSML into parts after this number of characters
const SSML_PART_HARD_LIMIT = isProduction === false ? 1000 : 1000
const AUDIO_BUFFER_SECS = 10

const listenOptionsOriginal = `
<div class="box" id="listen-options">
    <div id="listen-toggle">
    </div>

    <div id="voices-box">
        <p class="subtitle" style="">Voice to use <i class="far fa-question-circle setting-tippy"
                data-tippy-content="Pick the voice that you want to use when SwiftRead reads the text out loud."></i>
        </p>
        <div id="current-voice" class="voice"></div>

        <input id="search-voice" class="search input is-small" type="text"
            placeholder="Search by language, country, name" />

        <div id="voices" class="list">
            <div class="voice">
                <div class="field">
                    <div class="control">
                        <label class="radio">
                            <input type="radio" name="currentVoice" class="" value="test">
                            Loading voices...
                            <i class="fa fa-play-circle" aria-hidden="true"></i>
                        </label>
                    </div>
                </div>
            </div>
        </div>

    </div>
</div>
`

/////////////////////////////////
//       				       //
//       				       //
//    HTML AND SSML PARSING    //
//       				       //
//       				       //
/////////////////////////////////

// escape sepcial HTML characters in a string, like <, >, etc.
// https://stackoverflow.com/a/59604268/1686439
function serializeTextNode(text) {
  return new XMLSerializer().serializeToString(document.createTextNode(text))
}

function traverseAndTokenize(document, curElement, startWordIndex) {
  let curWordIndex = startWordIndex
  // get node's children
  const childNodes = curElement.childNodes
  for (let childNodeI = 0; childNodeI < childNodes.length; childNodeI++) {
    const childNode = childNodes[childNodeI]
    if (childNode.nodeType === 1) {
      // element node
      curWordIndex = traverseAndTokenize(document, childNode, curWordIndex)
    } else if (childNode.nodeType === 3) {
      // text node: tokenize the text here and replace the node
      const text = serializeTextNode(childNode.nodeValue) // text
      const nonWhitespace = /(\S+)/gm
      const matches = text.split(nonWhitespace) // words and spaces
      // console.log("tokens :", matches);
      // if we split on actual words, e.g. we didn't get the single token array [""]
      if (matches.length !== 1) {
        // add the span to all words
        // add another span to all spaces
        const curWordsWithSpan = []
        for (let i = 0; i < matches.length; i++) {
          let curWord = matches[i]
          const curWordTrimmed = curWord.trim()
          // console.log("word: ", curWord, "; length: ", curWord.length);
          // if word is not empty string
          if (curWord !== '') {
            // determine the token type
            let tokenType = 'word'
            if (curWordTrimmed.length === 0) {
              // trimmed word is empty
              tokenType = 'space'
            }
            // console.log("tokenType: ", tokenType);
            const oldWordLength = curWord.length
            // OLD: replace spaces with &nbsp; otherwise when parsing as DOM it'll remove any spaces between words
            if (tokenType == 'space') {
              curWord = ''
              for (let spaces = 0; spaces < oldWordLength; spaces++) {
                curWord += ''
              }
            }
            // put spans around word tokens
            if (tokenType === 'word') {
              // add space after every word
              curWord = `<span class='sr-token-${tokenType}' data-sr-token-type='${tokenType}' data-sr-word-index='${curWordIndex}'>${curWord} </span>`
              curWordIndex += 1
            }
            // else if (tokenType !== "word") {
            //     // curWord = "<span class='sr-token-" + tokenType + "' data-sr-token-type='" + tokenType + "'>" + curWord + "</span>";
            //     curWord = `<span class='sr-token-${tokenType}' data-sr-token-type='${tokenType}'>${curWord}</span>`;
            // }
            // console.log('curWord: ', curWord);
            curWordsWithSpan.push(curWord)
          }
        }
        const curWordsWithSpanString = curWordsWithSpan.join('')
        // console.log("curWordsWithSpanString: ", curWordsWithSpanString);
        // replace child node inline (with another child node)
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = `<span class='sr-token-node' data-sr-token-type="node">${curWordsWithSpanString}</span>`
        curElement.replaceChild(tempDiv.childNodes[0], childNode)
      }
    }
  }
  return curWordIndex
}
function tokenizeWordsInHTML(document, root) {
  traverseAndTokenize(document, root, 0)
}
function htmlToRHTML(document) {
  // transform html to "RHTML", "reader markup language". e.g. where every word is indexed
  // traverse HTML as DOM and tokenize and index every word
  // console.log('document before RHTML tokenization: ', document.cloneNode(true));
  tokenizeWordsInHTML(document, document.body)
  // console.log('document after RHTML tokenization: ', document.cloneNode(true));
  return document.body.innerHTML
}

const BREAK_TAG = '<break strength="x-strong"/>'
// export const EMPHASIS_TAG_START = "<emphasis level=\"strong\">";
// export const EMPHASIS_TAG_END = "</emphasis>";
// interface NewSSML {
//     newOuterHTML: string;
//     newOuterTags: string[];
// }
function wordSSML(curElement) {
  // mark tag is EMPTY element
  const wordHTML = curElement.innerHTML
  const wordIndexString = curElement.getAttribute('data-sr-word-index')
  const wordTag = `<mark name="${wordIndexString}"/>`
  const newHTML = `${wordTag}${wordHTML}`
  return { newOuterHTML: newHTML, newOuterTags: [wordTag, ''] }
}
// export const emphasisSSML = (curElement: Element): NewSSML => {
//     return {
//         newOuterHTML: `${EMPHASIS_TAG_START}${curElement.innerHTML}${EMPHASIS_TAG_END}`,
//         newOuterTags: [EMPHASIS_TAG_START, EMPHASIS_TAG_END]
//     };
// }
function breakSSML(curElement) {
  const elHTML = curElement.innerHTML
  // add break to beginning AND end of block (and remove block's HTML tag)
  const newHTML = `${BREAK_TAG}${elHTML}${BREAK_TAG}`
  return {
    newOuterHTML: newHTML,
    newOuterTags: [BREAK_TAG, BREAK_TAG],
  }
}

function processElementToSSML(curElement) {
  const tagName = curElement.tagName

  // for every <span data-sr-word-index>, REPLACE with <mark ...>
  if (tagName == 'SPAN' && curElement.hasAttribute('data-sr-word-index')) {
    return wordSSML(curElement)
  }

  // disable emphasis SSML tag: not supported by Amazon Polly
  // // if there are no children elements
  // // replace: every <i>, <b>, or <em>
  // // for: <emphasis ...>
  // const emphasisHTMLTags = ["I", "B", "EM"];
  // if (emphasisHTMLTags.includes(tagName)) {
  //     return emphasisSSML(curElement);
  // }

  // tree collapsing
  // replace:
  // every <p ...> or </p>
  // every <li ...> or </li>
  // every <blockquote ...> or </blockquote>
  // every <h* ...> or </h*>
  // every <div* ...> or </div>
  // every <br> or <br/>
  // with a single: <break ...>
  const breakHTMLTags = [
    'P',
    'LI',
    'BLOCKQUOTE',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'DIV',
    'BR',
  ]
  if (breakHTMLTags.includes(tagName)) {
    return breakSSML(curElement)
  }

  // otherwise, collapse the current element's top-level tag by returning inner HTML
  return { newOuterHTML: curElement.innerHTML, newOuterTags: ['', ''] }
}

function collapseToSSML(document, curElement) {
  const children = curElement.children
  if (children.length === 0) {
    const newOuterHTML = processElementToSSML(curElement).newOuterHTML
    return newOuterHTML
  } else {
    // otherwise, there are children elements
    // first, process the current element, and keep track of any changes

    const newOuterTags = processElementToSSML(curElement).newOuterTags

    let collapsedSSML = ''
    const childNodes = curElement.childNodes

    // then iterate through all child NODES (incl. text nodes)
    for (let childI = 0; childI < childNodes.length; childI++) {
      const childNode = childNodes[childI]

      if (childNode.nodeType === 1) {
        // if child node is an element, collapse/process it and add it to this element's new HTML
        const newCollapsedSSML = collapseToSSML(document, childNode)
        collapsedSSML += newCollapsedSSML
      } else {
        // otherwise, just append the text content
        collapsedSSML += childNode.textContent
      }
    }
    // add outer tags back
    collapsedSSML = `${newOuterTags[0]}${collapsedSSML}${newOuterTags[1]}`
    return collapsedSSML
  }
}

function dedupeSSMLBreak(ssmlString) {
  let bodyString = ssmlString
  // going to use regex here
  const multipleBreakRegex = /(?:(<break[^>]*>)\s*)+/gm
  // replace all single or multiple occurances of break with a single break
  bodyString = bodyString.replaceAll(multipleBreakRegex, BREAK_TAG)
  return bodyString
}

function ssmlWithSpeakAndProsody(ssmlString) {
  // surround with <prosody> tag
  let curSSML = `<prosody>${ssmlString}</prosody>`

  // surround with <speak>
  curSSML = `<speak>${curSSML}</speak>`
  return curSSML
}

function htmlToSSML(rhtmlDoc) {
  // transform RHTML (reader HTML) to SSML
  const document = rhtmlDoc

  // traverse tree, processing in place, return HTML string
  // doesn't have to be under a single element because it isn't processed as a DOM yet
  let curSSML = collapseToSSML(document, document.body)

  // de-dupe <break>
  curSSML = dedupeSSMLBreak(curSSML)

  // remove any "break" marks at the very beginning
  curSSML = curSSML.replace(/^((<\/?[a-z]+[^>]*>)*)(<break[^>]*>)/gm, '$1')

  curSSML = ssmlWithSpeakAndProsody(curSSML)

  return curSSML
}

function splitOnWordRegex(
  inputString,
  inputStringType,
  wordRegex,
  wordIndexGlobalRegex,
  numWordIndexsMustEqualNumTokens = true,
  keepWord = false
) {
  // split into word tokens
  // split on word regex, but keep the delimeter
  let tokens
  if (keepWord) {
    // if keepWord is true, keep the word delimiter
    wordRegex = RegExp(
      '(' + wordRegex.source + ')',
      (wordRegex.global ? 'g' : '') +
        (wordRegex.ignoreCase ? 'i' : '') +
        (wordRegex.multiline ? 'm' : '')
    )
    tokens = inputString.split(wordRegex)
    // join [word delimeter] with [word] (while, ignoring empty matches)
    const newTokens = []
    let curMergedToken = ''
    for (let i = 0; i < tokens.length; i++) {
      const curToken = tokens[i]
      const nextToken = i + 1 < tokens.length ? tokens[i + 1] : null
      if (curToken.trim().length === 0) {
        // if empty string, push current merged token if there is one
        if (curMergedToken.length > 0) {
          newTokens.push(curMergedToken)
          curMergedToken = ''
        }
      } else if (curToken.match(wordRegex)) {
        // if it's the delimeter, add it to token
        curMergedToken += curToken
      } else {
        // it's a non-delimeter, add it to the token
        curMergedToken += curToken
        // and check the next word. if that is a delimeter, end the merged token right here
        if (nextToken && nextToken.match(wordRegex)) {
          newTokens.push(curMergedToken)
          curMergedToken = ''
        }
      }
    }
    // push any remaining current merged token
    if (curMergedToken.length > 0) {
      newTokens.push(curMergedToken)
      curMergedToken = ''
    }
    tokens = newTokens
  } else {
    tokens = inputString.split(wordRegex)
  }
  // console.log('tokens: ', tokens);

  // make sure max word index matches the number of split tokens
  const wordIndexMatches = Array.from(
    inputString.matchAll(wordIndexGlobalRegex)
  )
  // console.log('wordIndexMatches: ', wordIndexMatches);
  const minWordIndex = parseInt(wordIndexMatches[0][1])
  const maxWordIndex = parseInt(
    wordIndexMatches[wordIndexMatches.length - 1][1]
  )
  // console.log('minWordIndex: ', minWordIndex);
  // console.log('maxWordIndex: ', maxWordIndex);

  const numWordIndexes = maxWordIndex - minWordIndex + 1
  // console.log('numWordIndexes: ', numWordIndexes);

  if (numWordIndexsMustEqualNumTokens) {
    if (numWordIndexes === tokens.length) {
      // number of word indexes matches number of RHTML tokens exactly
      // console.log('tokens.length: ', tokens.length);
      return tokens
    } else if (numWordIndexes === tokens.length - 1) {
      // otherwise, we have one more token than we have wordIndexes
      // it's because the first token is content/html that appears before the first token: join it with the first token
      const firstToken = tokens[0]
      tokens = tokens.slice(1, tokens.length)
      tokens[0] = firstToken + tokens[0]
      // console.log('tokens.length: ', tokens.length);
      return tokens
    } else {
      // for some reason, number of processed RHTML tokens is more than 1 larger than number of wordIndexes taken from the RHTML itself
      // this should never happen, but in case it does, need to log for debugging
      // TODO: log or otherwise make visible necessary data for debugging
      console.error(
        'split tokens and number of word indexes are not equal: ',
        tokens.length,
        numWordIndexes
      )
      pushEvent(
        'error',
        `listen-num-wordIndexes-and-${inputStringType}-tokens-not-equal`,
        tokens.length - numWordIndexes
      )
      alert(
        "Error when processing document for audio. Error code: 1. Please notify help@swiftread.com along with the website or document that you're trying to read."
      )
    }
  } else {
    // console.log('tokens.length: ', tokens.length);
    return tokens
  }
}
function splitRHTML(rhtmlString) {
  // TODO: get max wordIndex in RHTML
  // console.log('rhtmlString: ', rhtmlString);

  // remove all ending span tags
  let processedRHTMLString = rhtmlString.replaceAll(/<\/span.*?>/gi, '')
  // remove all "node" span tags
  processedRHTMLString = processedRHTMLString.replaceAll(
    /<span class="sr-token-node".*?>/gi,
    ''
  )
  // console.log('processedRHTMLString: ', processedRHTMLString);

  const wordRegex = /<span class="sr-token-word".*?>/
  const wordIndexGlobalRegex =
    /<span class="sr-token-word".*?data-sr-word-index="(\d+)".*?>/g

  return splitOnWordRegex(
    processedRHTMLString,
    'rhtml',
    wordRegex,
    wordIndexGlobalRegex
  )
}

function prepareHTMLForListen(html) {
  console.log('preparing html for listen...')
  // console.log('input html: ', html);

  const htmlDoc = new DOMParser().parseFromString(html, 'text/html')
  // console.log('htmlDoc: ', htmlDoc.cloneNode(true));

  // convert to RHTML, where every word is enclosed by a span
  const rhtmlString = htmlToRHTML(htmlDoc)
  // console.log('rhtmlString: ', rhtmlString);

  const rhtmlDoc = new DOMParser().parseFromString(rhtmlString, 'text/html')
  // console.log('rhtmlDoc: ', rhtmlDoc.cloneNode(true));

  // convert to SSML
  const ssmlString = htmlToSSML(rhtmlDoc)
  // console.log('ssmlString: ', ssmlString);

  // split RHTML
  const rhtmlTokens = splitRHTML(rhtmlDoc.body.innerHTML)
  // console.log('rhtmlTokens: ', rhtmlTokens);

  return { htmlTokens: rhtmlTokens, ssml: ssmlString }
}

function partitionSSML(ssml) {
  // console.log('partitioning ssml...');
  // since ssmlParts will be reset, reset dependent parts of the listen state
  resetListenState()

  // partition SSML into parts that fit the char limits of text-to-speech API
  // partition "intelligently" on "paragraph" breaks, sentences, or worst case words

  // first, remove <speak> and <prosody> tags
  // console.log('pre-partitioned ssml: ', ssml);
  ssml = ssml.replaceAll(/<\/?speak.*?>/g, '')
  ssml = ssml.replaceAll(/<\/?prosody.*?>/g, '')

  // console.log('ssml after removing speak and prosody tags: ', ssml);

  // 2023-03-06: removed paragraph breaks as a break condition
  // because they don't work well with the way Google's TTS suddently started handling SSML with timepoints
  // 1st: match any "paragraph" break
  // 2nd: remove any tags, trim, and match sentence end puncutation
  // 3rd: break on this word
  const PRIORITIZED_BREAK_CONDITIONS = [
    // {
    //     name: "paragraph",
    //     condition: (word) => word.match(/<break.*?\/>/i)
    // },
    {
      name: 'sentence',
      condition: (word) =>
        word
          .replaceAll(/<([^>]+)>\s*/gi, '')
          .trim()
          .match(/[.!?]$/),
    },
  ]

  const wordRegex = /<mark name=.*?>/
  const wordIndexGlobalRegex = /<mark name="(\d+)"\/>/g

  const tokens = splitOnWordRegex(
    ssml,
    'ssml',
    wordRegex,
    wordIndexGlobalRegex,
    (numWordIndexsMustEqualNumTokens = true),
    (keepWord = true)
  )

  let curPartLength = 0
  let curPartMinIndex = 0
  let curPartMaxIndex = 0
  let lastBreaksOrdered = {
    paragraph: null,
    sentence: null,
  }

  const allSSMLParts = []

  function createPart(minIndex, maxIndex, curIndex) {
    // inclusive of min and max index
    allSSMLParts.push({
      ssml: tokens.slice(minIndex, maxIndex + 1).join(''),
      minWordIndex: minIndex,
      maxWordIndex: maxIndex,
    })
    curPartMinIndex = maxIndex + 1
    curPartMaxIndex = curPartMinIndex
    if (maxIndex + 1 < curIndex) {
      // if we're creating a part that ends before the current index, keep track of the part length we've already created
      curPartLength = tokens.slice(maxIndex + 1, curIndex).join('').length
    } else {
      curPartLength = 0
    }

    lastBreaksOrdered = {
      paragraph: null,
      sentence: null,
    }
  }
  function lengthOfPart(minIndex, maxIndex) {
    // inclusive of min and max index
    return tokens.slice(minIndex, maxIndex + 1).join('').length
  }

  for (let i = 0; i < tokens.length; i++) {
    const curToken = tokens[i]

    // // 2023-03-06: break immediately on first sentence detected
    // if (lastBreaksOrdered.sentence) {
    //   createPart(curPartMinIndex, lastBreaksOrdered.sentence, i);
    // }

    // if current token would put us over the hard limit (presumed that the last token didn't)
    if (curToken.length + curPartLength > SSML_PART_HARD_LIMIT) {
      // if there weren't any previous breaks, start a new part at this word
      if (!lastBreaksOrdered.paragraph && !lastBreaksOrdered.sentence) {
        createPart(curPartMinIndex, curPartMaxIndex, i)
      } else {
        // there was one possible break
        if (
          lastBreaksOrdered.paragraph &&
          lengthOfPart(curPartMinIndex, lastBreaksOrdered.paragraph) <=
            SSML_PART_HARD_LIMIT
        ) {
          // break on the last paragraph, unless doing so would put us above the hard limit
          createPart(curPartMinIndex, lastBreaksOrdered.paragraph, i)
        } else if (
          lastBreaksOrdered.sentence &&
          lengthOfPart(curPartMinIndex, lastBreaksOrdered.sentence) <=
            SSML_PART_HARD_LIMIT
        ) {
          // break on the last sentence, unless doing so would put us above the hard limit
          createPart(curPartMinIndex, lastBreaksOrdered.sentence, i)
        } else {
          // there was a last paragraph or sentence break but either of them would've gone beyond the hard limit
          // so just create the part and start a new part at this word
          createPart(curPartMinIndex, curPartMaxIndex, i)

          // TODO: what if the last word itself puts us above the hard limit?
        }
      }
    }
    // include this token in the current part
    curPartLength += curToken.length
    curPartMaxIndex = i

    // if we're beyond the soft limit, start keeping track of potential break points
    if (curPartLength >= SSML_PART_SOFT_LIMIT) {
      // check if current token could match one of the prioritized break conditions
      PRIORITIZED_BREAK_CONDITIONS.forEach((breakConditionObj) => {
        if (breakConditionObj.condition(curToken)) {
          lastBreaksOrdered[breakConditionObj.name] = i
        }
      })
    }
  }
  // we've iterated through all tokens but still might have an outstanding part to create
  if (curPartLength > 0) {
    createPart(curPartMinIndex, curPartMaxIndex)
  }

  // console.log('allSSMLParts: ', allSSMLParts);
  // console.log('allSSMLParts lengths: ', allSSMLParts.map((ssmlPart) => ssmlPart.ssml.length));
  ssmlParts = allSSMLParts

  // generate wordIndex to ssmlPartIndex map
  wordIndexToSSMLPartIndexMap = {}
  ssmlParts.forEach((ssmlPart, ssmlPartIndex) => {
    for (let i = ssmlPart.minWordIndex; i <= ssmlPart.maxWordIndex; i++) {
      wordIndexToSSMLPartIndexMap[i] = ssmlPartIndex
    }
  })
  // console.log('wordIndexToSSMLPartIndexMap: ', wordIndexToSSMLPartIndexMap);
}

/////////////////////////////////
//       				       //
//       				       //
//       LISTEN FUNCTIONS      //
//       				       //
//       				       //
/////////////////////////////////

/// --- LISTEN UI
function updateVoice(initial = false) {
  voiceId = getSetting(state.settingsStore.SETTING_CURRENT_VOICE_KEY)

  if (initial === false) {
    // clear all SSML parts because we will fetch audio using new voice
    partitionSSML(fullSSML)
    if (listenEnabled === true) {
      fetchAudioForWordIndex(wordIndex)
    }
  }
}
function getListenSettings(initial = false) {
  listenEnabled =
    getSetting(state.settingsStore.SETTING_LISTEN_ENABLED_KEY) === 'true'
      ? true
      : false

  if (!initial) {
    console.log('Listen toggled to: ', listenEnabled)
    trackEvent('Listen Toggled', { enabled: listenEnabled })
  }

  if (getUserLicense() === null) {
    listenEnabled = false
    state.settingsStore.setSetting(
      state.settingsStore.SETTING_LISTEN_ENABLED_KEY,
      listenEnabled
    )
  }

  // console.log('listenEnabled: ', listenEnabled);
  registerEventSuperProperty({ 'Listen Enabled': listenEnabled })

  renderListenIcon()

  audioWPM = getSetting(state.settingsStore.SETTING_AUDIO_WPM_KEY)
  // console.log('audioWPM: ', audioWPM);
  // render WPM but only if not part of initialization: it should already be called in initialization
  if (!initial) {
    renderWPM()
  }

  updateVoice(true)

  if (listenEnabled === true && !initial) {
    console.log('preparing audio on listen enabled: ')
    seekToCurrentWordIndexInAudio(wordIndex) // seek, fetch audio, but do not play because isPlaying should be false because of the pause()
  }
}
function setAudioWPM(wpm) {
  audioWPM = wpm
  state.settingsStore.setSetting(state.settingsStore.SETTING_AUDIO_WPM_KEY, wpm)

  // update the playback rate
  calculateAndSetAudioPlaybackRate(wordIndex)
}
// toggleListenEnabled is no longer needed, because it was used for clicking and hotkey?
async function toggleListenEnabled() {
  // pause everything first
  const wasPlaying = state.isPlaying
  console.log('pausing everything, if was playing: ', wasPlaying)
  if (wasPlaying === true) {
    pause()
  }

  if (getUserLicense() === null) {
    attemptRedirectToPaid(state.settingsStore.SETTING_LISTEN_ENABLED_KEY)
  } else {
    // invert the setting
    listenEnabled = !listenEnabled
    state.settingsStore.setSetting(
      state.settingsStore.SETTING_LISTEN_ENABLED_KEY,
      listenEnabled.toString()
    )

    console.log('getting listen settings after manual toggle...')
    getListenSettings()

    if (wasPlaying === true) {
      play()
    }
  }
}
async function renderListenIcon() {
  console.log(
    're-rendering listen button and overlay... listenEnabled: ',
    listenEnabled
  )

  const listenButton = document.getElementById('listen')
  let listenIcon = $(listenButton).find('.fas')
  if (!listenEnabled) {
    // console.log('adding mute speaker icon');
    listenIcon.removeClass('fa-volume-up')
    listenIcon.addClass('fa-volume-mute')
  } else {
    // console.log('adding active speaker icon');
    listenIcon.removeClass('fa-volume-mute')
    listenIcon.addClass('fa-volume-up')
  }

  // re-render the listen options modal
  // first, re-populate only the relevant settings, and only re-render (do not re-add listeners)
  // populate voice select
  const onlyKeys = ['listenEnabled', 'currentVoice']

  console.log('resetting listenOptions to be original listen options')
  // the template is null, so re-populate with original listen options
  $('#listen-tooltip-template').html(listenOptionsOriginal)
  let listenOptions = document.getElementById('listen-options')

  await populateVoiceSelect() // first, populate the voices
  await populateSettings(onlyKeys) // then, add click listeners to all the listen options

  // show settings tooltips
  tippy('.setting-tippy', { allowHTML: true, delay: [0, 100] })

  if (listenButton._tippy) {
    // listen button already has a tippy, remove it
    // console.log('destroying existing tippy...');
    listenButton._tippy.destroy()
  }

  // console.log('adding new tippy...');
  if (listenOptions) {
    tippy(listenButton, {
      content: listenOptions,
      allowHTML: true,
      interactive: true,
      delay: [0, 100],
      onShow(instance) {
        unbindMouseWheelScroll()
      },
      onHidden(instance) {
        bindMouseWheelTextScroll()
      },
    })
  } else {
  }
}

/// --- LISTEN SSML PART HANDLING
function getSSMLPartIndex(inputWordIndex) {
  const ssmlPartIndex = wordIndexToSSMLPartIndexMap[inputWordIndex]
  return ssmlPartIndex
}
function getSSMLPart(inputWordIndex) {
  // console.log('getting ssml part for word index: ', inputWordIndex);

  const ssmlPartIndex = getSSMLPartIndex(inputWordIndex)
  const ssmlPart = ssmlParts[ssmlPartIndex]
  return ssmlPart
}
function getCurrentSSMLPart() {
  return ssmlParts[currentSSMLPartIndex]
}
function isCurrentSSMLPartIndex(inputWordIndex) {
  if (typeof currentSSMLPartIndex === 'undefined') {
    currentSSMLPartIndex = getSSMLPartIndex(inputWordIndex)
    return true
  } else {
    const inputSMSLPartIndex = getSSMLPartIndex(inputWordIndex)
    if (currentSSMLPartIndex !== inputSMSLPartIndex) {
      return false
    } else {
      return true
    }
  }
}
function updateCurrentSSMLPartIndex(inputWordIndex) {
  const ssmlPartIndex = getSSMLPartIndex(inputWordIndex)
  console.log(
    'does currentSSMLPartIndex need to be updated from x to y?',
    currentSSMLPartIndex,
    ssmlPartIndex
  )
  if (typeof currentSSMLPartIndex === 'undefined') {
    console.log(
      'updating currentSSMLPartIndex because it is undefined: ',
      currentSSMLPartIndex,
      ssmlPartIndex
    )
    currentSSMLPartIndex = ssmlPartIndex
  } else if (currentSSMLPartIndex !== ssmlPartIndex) {
    console.log(
      'updating currentSSMLPartIndex from x to y because they are different: ',
      currentSSMLPartIndex,
      ssmlPartIndex
    )
    currentSSMLPartIndex = ssmlPartIndex
  }
}
function resetCurrentSSMLPartIndex() {
  currentSSMLPartIndex = undefined
}

/// --- LISTEN AUDIO FUNCTIONALITY
function updateSSMLPartListener(ssmlPart, listenerKey) {
  if (!ssmlPart.hasListeners) {
    ssmlPart.hasListeners = {}
    ssmlPart.hasListeners[listenerKey] = true
  } else {
    ssmlPart.hasListeners[listenerKey] = true
  }
}
function hasSSMLPartListener(ssmlPart, listenerKey) {
  if (!ssmlPart.hasListeners) return false
  else {
    return ssmlPart.hasListeners[listenerKey] ?? false
  }
}

async function fetchAudioForWordIndex(wordIndex) {
  const ssmlPart = getSSMLPart(wordIndex)
  await fetchAudioForSSMLPart(ssmlPart, wordIndex)
}
async function fetchAudioForSSMLPart(ssmlPart, wordIndex) {
  // do not allow parallel fetches
  if (ssmlPart.loading && ssmlPart.loading === true) return
  if (!ssmlPart.loading || ssmlPart.loading === false) ssmlPart.loading = true

  // if current ssmlPart does not have a listenId and does not have an audio or timepoints
  if (!ssmlPart.listenId && (!ssmlPart.audio || !ssmlPart.timepoints)) {
    // tell server to generate (or get from cache) the audio and timepoints
    const postData = {
      ssml: ssmlPart.ssml,
      licenseKey: getUserLicense(),
    }
    if (typeof voiceId !== 'undefined') {
      postData.voiceId = voiceId
    }
    const response = await fetch(`${SERVER_API_URL}listen`, {
      method: 'POST',
      body: JSON.stringify(postData),
      headers: {
        'Content-Type': 'application/json',
      },
    }).catch((reason) => {
      console.error(reason)
      alert(
        'Error requesting fetch new audio, screenshot and report to help@swiftread.com: ' +
          reason
      )
    })

    const jsonResponse = await response.json()
    if (response.status !== 200) {
      console.error(jsonResponse)
      alert(
        'Error in audio response for new audio, screenshot and report to help@swiftread.com: ' +
          JSON.stringify({ status: response.status, ...jsonResponse })
      )
    } else {
      // response was successful
      listenResponse = jsonResponse // typecript would be very helpful here...
      // expect listenResponse to have listenId, collection name, wordIndex

      // update in place
      ssmlPart.listenId = listenResponse.id

      getListenAudio(listenResponse, wordIndex)
    }
  } else if (ssmlPart.listenId && (!ssmlPart.audio || !ssmlPart.timepoints)) {
    // for some reason, we have a listenId but no audio (or timepoints) yet
    // so just wait for it: it's presumed that we already submitted the POST to generate the audio
    // send GET request to get the id and collection name again
    const response = await fetch(
      `${SERVER_API_URL}listen` +
        encodeQueryString({
          listenId: ssmlPart.listenId,
        })
    ).catch((reason) => {
      console.error(reason)
      alert(
        'Error requesting fetch new audio for existing listen, screenshot and report to help@swiftread.com: ' +
          reason
      )
    })

    const jsonResponse = await response.json()
    if (response.status !== 200) {
      console.error(jsonResponse)
      alert(
        'Error in audio response for existing listen, screenshot and report to help@swiftread.com: ' +
          JSON.stringify({ status: response.status, ...jsonResponse })
      )
    } else {
      // response was successful
      listenResponse = jsonResponse // typecript would be very helpful here...
      getListenAudio(listenResponse, wordIndex)
    }
  } else {
    // the audio for this ssml part is ready, do nothing
  }
}

async function forceUpdateAudio(inputWordIndex) {
  const ssmlPart = getSSMLPart(inputWordIndex)
  const postData = {
    ssml: ssmlPart.ssml,
    licenseKey: getUserLicense(),
    forceUpdate: true,
  }
  if (typeof voiceId !== 'undefined') {
    postData.voiceId = voiceId
  }
  const response = await fetch(`${SERVER_API_URL}listen`, {
    method: 'POST',
    body: JSON.stringify(postData),
    headers: {
      'Content-Type': 'application/json',
    },
  }).catch((reason) => {
    console.error(reason)
    alert(
      'Error requesting updated audio, screenshot and report to help@swiftread.com: ' +
        reason
    )
  })

  const jsonResponse = await response.json()
  if (response.status !== 200) {
    console.error(jsonResponse)
    alert(
      'Server error while updating audio data. Report the following to help@swiftread.com:' +
        JSON.stringify(jsonResponse)
    )
  } else {
    // response was successful
    listenResponse = jsonResponse // typecript would be very helpful here...
    // expect listenResponse to have listenId, collection name, wordIndex
    ssmlPart.listenId = listenResponse.id

    getListenAudio(listenResponse, inputWordIndex)
  }
}

function interpolateTimepoints(timepoints) {
  // console.log("interpolating timepoints...", timepoints);
  // Convert the dictionary to an array of [wordIndex, timepoint] pairs
  const entries = Object.entries(timepoints).map(([key, value]) => [
    parseInt(key),
    value,
  ])

  for (let i = 1; i < entries.length - 1; i++) {
    if (entries[i][1] === 0) {
      // Find previous non-zero value
      let prev = i - 1
      while (prev >= 0 && entries[prev][1] === 0) {
        prev--
      }

      // Find next non-zero value
      let next = i + 1
      while (next < entries.length && entries[next][1] === 0) {
        next++
      }

      // If there are non-zero values both before and after the zero value
      if (prev >= 0 && next < entries.length) {
        entries[i][1] = (entries[prev][1] + entries[next][1]) / 2
      }
    }
  }

  // Convert the array back to a dictionary
  const fixedTimepoints = {}
  for (const [wordIndex, timepoint] of entries) {
    fixedTimepoints[wordIndex] = timepoint
  }

  // console.log("interpolated timepoints: ", fixedTimepoints);
  return fixedTimepoints
}

function parseAdditionalAudioMetadata(inputWordIndex) {
  console.log('parsing audio duration, num words, and wpm')
  const ssmlPart = getSSMLPart(inputWordIndex)

  if (ssmlPart.audio && ssmlPart.timepoints && ssmlPart.audio.duration) {
    ssmlPart.audioDuration = ssmlPart.audio.duration
    ssmlPart.numWords = Object.keys(ssmlPart.timepoints).length
    ssmlPart.wpm = ssmlPart.numWords / (ssmlPart.audioDuration / 60)
    ssmlPart.timepoints = interpolateTimepoints(ssmlPart.timepoints)
    renderWPM()
  } else {
    console.warn(
      'input ssmlPart for wordIndex does not have audio, timepoints, or audio.duration. did not parse audio duration, num words, and wpm: ',
      inputWordIndex
    )
  }
}

function _createAudioFromSSMLPart(ssmlPart) {
  const audio = new Audio(ssmlPart.audioUrl)
  audio.preload = 'auto'
  return audio
}
function parseReturnListenAudioRequest(request) {
  const wordIndex = request.wordIndex
  const ssmlPart = getSSMLPart(wordIndex)

  ssmlPart.timepoints = request.timepoints
  ssmlPart.timepointsUrl = request.timepointsUrl

  ssmlPart.audioUrl = request.audioUrl
  ssmlPart.audio = new Audio(ssmlPart.audioUrl)

  // functions to call when audio metadata is loaded
  if (!hasSSMLPartListener(ssmlPart, LOADED_METADATA_LISTENER_KEY)) {
    ssmlPart.audio.addEventListener(LOADED_METADATA_LISTENER_KEY, function (e) {
      console.log('audio metadata load detected')
      parseAdditionalAudioMetadata(wordIndex)
    })
    updateSSMLPartListener(ssmlPart, LOADED_METADATA_LISTENER_KEY)
  }

  ssmlPart.parsedAt = new Date()

  ssmlPart.loading = false
}

async function waitAndGetAudioForWordIndex(inputWordIndex, timeout = 15000) {
  const wordIndex = inputWordIndex

  return new Promise((resolve, reject) => {
    const ssmlPart = getSSMLPart(wordIndex)

    const interval = 10
    const maxTries = timeout / interval
    let tries = 0
    let check = setInterval(function () {
      tries += 1
      if (tries > maxTries) {
        clearInterval(check)
        hideInProgressIndicator()
        reject('Retreiving audio timed out')
      }

      const audio = ssmlPart.audio
      const timepoints = ssmlPart.timepoints

      if (audio && timepoints) {
        clearInterval(check)
        hideInProgressIndicator()
        resolve({ audio, timepoints })
      }

      if (tries * interval === 250) {
        showInProgressIndicator()
      }
    }, interval)
  })
}

async function waitForSSMLPartWPMGivenWordIndex(
  inputWordIndex,
  timeout = 15000
) {
  const wordIndex = inputWordIndex

  return new Promise((resolve, reject) => {
    const interval = 10
    const maxTries = timeout / interval
    let tries = 0
    let check = setInterval(function () {
      tries += 1
      if (tries > maxTries) {
        clearInterval(check)
        reject("Retreiving ssml part's duration / WPM timed out")
      }

      const ssmlPart = getSSMLPart(wordIndex)
      // console.log("[DEBUG] ssmlPart: ", ssmlPart);
      const audioDuration = ssmlPart.audioDuration
      const wpm = ssmlPart.wpm
      // console.log("[DEBUG] audioDuration, wpm: ", audioDuration, wpm);

      if (audioDuration && wpm) {
        clearInterval(check)
        resolve({ audioDuration, wpm })
      } else {
        // try parsing out audio duration and wpm from the existing ssmlPart, listen may have missed it
        parseAdditionalAudioMetadata(wordIndex)
      }
    }, interval)
  })
}

async function playAudio(inputWordIndex) {
  console.log('Play audio called on word index: ', inputWordIndex)
  // do not play if trying to play an ssml part that isn't the current one
  if (!isCurrentSSMLPartIndex(inputWordIndex)) {
    console.log(
      'trying to play audio for an audio part that is not current, ignoring'
    )
    return
  }

  const ssmlPart = getSSMLPart(inputWordIndex)
  // console.log('ssmlPart: ', ssmlPart);

  // wait for audio and timepoints for current ssmlPart
  // assumes server request has already been made
  console.log('Waiting for audio and timepoints for wordIndex', inputWordIndex)
  const { audio, timepoints } = await waitAndGetAudioForWordIndex(
    inputWordIndex
  )
  console.log('Retrieved audio and timepoints.')
  // console.log(audio, timepoints);

  // timepoint for the input word index could be null, if the synthesized audio isn't able to read the "word" (e.g. the "word" is a special character)
  let nextWordIndexWithTimepoint = inputWordIndex
  if (!timepoints[nextWordIndexWithTimepoint]) {
    console.log(
      'No timepoint for input word index, trying to find next word index with timepoint'
    )
    // while current word index does not have a timepoint and is within the ssmlPart's max word index (i.e. assume the current ssml part contains a voiceable word), increment the word index
    while (
      !timepoints[nextWordIndexWithTimepoint] &&
      nextWordIndexWithTimepoint <= ssmlPart.maxWordIndex
    ) {
      nextWordIndexWithTimepoint += 1
      wordIndex += 1 // increase the global word index as well
    }
  }

  console.log('Calculating playback rate given audio WPM of: ', audioWPM)
  await calculateAndSetAudioPlaybackRate(nextWordIndexWithTimepoint)

  console.log(
    'Seek to correct point in audio before playing: ',
    timepoints[nextWordIndexWithTimepoint]
  )
  audio.currentTime = timepoints[nextWordIndexWithTimepoint]

  console.log('Playing...')
  // play audio
  audio.play()
  // check the audio's current time after a delay to make sure it has moved
  // for some reason, the audio.currentTime doesn't always move after play() is called, and a reload is needed
  const currentAudioTimeAtPlay = audio.currentTime
  setTimeout(async () => {
    console.log('Checking audio current time immediately after play...')
    const currentAudio = getSSMLPart(inputWordIndex).audio
    const currentAudioTime = currentAudio ? currentAudio.currentTime : undefined
    if (!currentAudioTime || currentAudioTime === currentAudioTimeAtPlay) {
      console.log(
        'Audio has not moved after play, reloading audio and trying to play again.'
      )
      // reload audio
      getSSMLPart(inputWordIndex).audio.load()
      // recalculate playback rate
      const newPlaybackRate = await calculateAndSetAudioPlaybackRate(
        inputWordIndex
      )
      console.log('New playback rate: ', newPlaybackRate)
      getSSMLPart(inputWordIndex).audio.playbackRate = newPlaybackRate
      getSSMLPart(inputWordIndex).audio.play()
    }
  }, 500)
  // move the visual pacer
  movePacerToWordIndex(nextWordIndexWithTimepoint)

  // while playing audio, periodically check current time
  function periodicCurrentTimeCheck() {
    /////
    // MOVE PACER TO WORD INDEX BASED ON CURRENT AUDIO TIME
    /////
    const currentAudio = audio
    const currentTime = currentAudio.currentTime

    let newWordIndex = wordIndex // use the global wordIndex in audio update
    let curWordIndexTimepoint = timepoints[newWordIndex]
    // get the next word index in timepoints, might skip a wordindex

    // // debug
    // console.log('audio time update: current wordIndex at timepoint: ', newWordIndex, curWordIndexTimepoint);

    // only iterate visual pacer forward if audio time has advanced passed the wordIndex's timepoint
    if (currentTime > curWordIndexTimepoint) {
      // // debug
      // console.log('currentTime: ', currentTime);

      // filter timepoints to those that are less than the audio player's currentTime
      const timepointEntries = Object.entries(timepoints)
      let filteredTPE = timepointEntries.filter(([wordIndex, timepoint]) => {
        return timepoint <= currentTime
      })
      // console.log('filteredTPE: ', filteredTPE);
      if (filteredTPE.length === 0) {
        // this should never happen, because timepoints shouldn't be empty when audio is playing
        console.warn(
          'no timepoints <= currentTime: ',
          timepointEntries,
          currentTime
        )
      } else {
        // get the timepoint with the largest time, use its wordIndex as the next word
        filteredTPE.sort((tpe1, tpe2) => {
          return tpe1[1] - tpe2[1]
        })
        // console.log('sorted filteredTPE: ', filteredTPE);

        const lastTPE = filteredTPE[filteredTPE.length - 1]
        // console.log('lastTPE: ', lastTPE);
        newWordIndex = parseInt(lastTPE[0])

        if (newWordIndex != wordIndex) {
          // audio has moved onto another word, move pacer to it
          // track the number of words read
          for (
            let curWordIndex = wordIndex;
            curWordIndex < newWordIndex;
            curWordIndex++
          ) {
            countWord(curWordIndex)
          }

          // console.log('moving pacer to new wordIndex: ', newWordIndex);
          wordIndex = newWordIndex
          movePacerToWordIndex(newWordIndex)
        }
      }
    }

    /////
    // PRE-LOAD NEXT AUDIO
    /////
    const timeLeftSec =
      (currentAudio.duration - currentAudio.currentTime) /
      currentAudio.playbackRate
    if (timeLeftSec <= AUDIO_BUFFER_SECS && timeLeftSec > 0) {
      // console.log(`less than ${AUDIO_BUFFER_SECS} seconds left in currently playing audio, seeing if need to fetch audio for next part...`);

      // fetch the audio for the next ssml part after input wordIndex
      const ssmlPartIndex = wordIndexToSSMLPartIndexMap[wordIndex]
      if (ssmlPartIndex < ssmlParts.length - 1) {
        const nextSSMLPart = ssmlParts[ssmlPartIndex + 1]
        const nextSSMLPartFirstWordIndex = nextSSMLPart.minWordIndex

        if (!nextSSMLPart.listenId) {
          console.log(
            'current part almost finished, pre-fetching audio for next part...'
          )
          fetchAudioForSSMLPart(nextSSMLPart, nextSSMLPartFirstWordIndex)
        } else {
          // console.log('audio for next part is being fetched or already exists');
        }
      }
    }
  }
  if (typeof periodicCurrentTimeChecker !== 'undefined')
    clearInterval(periodicCurrentTimeChecker)
  periodicCurrentTimeChecker = setInterval(periodicCurrentTimeCheck, 50)

  // only add event listeners if they don't already exist on the object
  if (!hasSSMLPartListener(ssmlPart, ENDED_LISTENER_KEY)) {
    console.log(`no listener for ${ENDED_LISTENER_KEY}, adding one`)
    audio.addEventListener(ENDED_LISTENER_KEY, async (event) => {
      console.log('playlist ended')

      // assume that when the audio ends for this part, we're at the last wordIndex of the part
      if (currentSSMLPartIndex + 1 <= ssmlParts.length - 1) {
        // get the next part, if there is one
        const nextSSMLPart = ssmlParts[currentSSMLPartIndex + 1]
        // set the word index to the min word index of the next part
        const nextWordIndex = nextSSMLPart.minWordIndex
        // if not: pull the audio, wait for it, then increment the wordIndex and play the audio
        if (
          !nextSSMLPart.audio ||
          !nextSSMLPart.timepoints ||
          (nextSSMLPart.timepoints &&
            Object.keys(nextSSMLPart.timepoints).length === 0)
        ) {
          console.log(
            'it does not have audio and timepoints, so fetch it and wait...'
          )
          fetchAudioForWordIndex(nextWordIndex)

          await waitAndGetAudioForWordIndex(nextWordIndex)
          wordIndex = nextWordIndex
          updateCurrentSSMLPartIndex(nextWordIndex)
          playAudio(nextWordIndex)
        }
        // if it does, increment the wordIndex and play the audio
        else {
          console.log('it does have audio and valid timepoints')
          wordIndex = nextWordIndex
          updateCurrentSSMLPartIndex(nextWordIndex)
          playAudio(nextWordIndex)
        }
      } else {
        // if we've ended the last part, means we're done reading this page
        doneReadingPage()
      }
    })
    updateSSMLPartListener(ssmlPart, ENDED_LISTENER_KEY)
  }
}

async function pauseCurrentAudio() {
  const { audio, timepoints } = await waitAndGetAudioForWordIndex(wordIndex)
  audio.pause()
}

async function seekToCurrentWordIndexInAudio(currentWordIndex) {
  console.log(
    `seeking to new point in audio for word index ${currentWordIndex}...`
  )
  // if current audio is part of a different ssml part, pause it
  const wordIndexIsCurrentSSMLPartIndex =
    isCurrentSSMLPartIndex(currentWordIndex)
  console.log(
    'is the SSML part for the word index the current one? ',
    wordIndexIsCurrentSSMLPartIndex
  )

  if (wordIndexIsCurrentSSMLPartIndex === false) {
    console.log(
      `current audio for ssml part ${currentSSMLPartIndex} is different for new ssml part ${getSSMLPartIndex(
        currentWordIndex
      )}`
    )
    if (getCurrentSSMLPart().audio) {
      console.log(`pausing current audio for ssml part ${currentSSMLPartIndex}`)
      getCurrentSSMLPart().audio.pause()
    }
  }

  // get current ssml part
  const ssmlPart = getSSMLPart(currentWordIndex)
  console.log(
    'seek called for wordIndex, ssmlPartIndex: ',
    currentWordIndex,
    getSSMLPartIndex(currentWordIndex)
  )

  // set the current ssml part index to the appropriate one
  updateCurrentSSMLPartIndex(currentWordIndex)

  // get if has audio
  // if not, fetch and get audio
  if (!ssmlPart.audio || !ssmlPart.timepoints) {
    console.log('it does not have audio, so fetch it and wait...')
    fetchAudioForWordIndex(currentWordIndex)
    const { audio, timepoints } = await waitAndGetAudioForWordIndex(
      currentWordIndex
    )
    // seek
    console.log('ssmlPart audio and timepoints retrieved. seek')
    audio.currentTime = timepoints[currentWordIndex]

    // if supposed to be playing, play the new audio
    if (state.isPlaying) {
      playAudio(currentWordIndex)
    }
  } else {
    // seek
    console.log('ssmlPart audio and timepoints already exist, so seek')
    const audio = ssmlPart.audio
    const timepoints = ssmlPart.timepoints
    // console.log(audio, timepoints);
    const newCurrentTime = timepoints[currentWordIndex]
    console.log('new current time: ', newCurrentTime)
    audio.currentTime = newCurrentTime

    // if supposed to be playing, play the new audio
    if (state.isPlaying) {
      playAudio(currentWordIndex)
    }
  }
}

async function calculateAndSetAudioPlaybackRate(inputWordIndex) {
  await waitForSSMLPartWPMGivenWordIndex(inputWordIndex)

  const ssmlPart = getSSMLPart(inputWordIndex)
  console.log('ssmlPart: ', ssmlPart)
  // calculate required audio play back rate given input ssmlPart
  let playbackFactor = audioWPM / ssmlPart.wpm
  console.log(
    'target audio WPM, given ssml part WPM, implies playback rate of: ',
    audioWPM,
    ssmlPart.wpm,
    playbackFactor
  )

  // algorithm to prevent audio playback rate from changing too quickly
  if (typeof lastAudioPlaybackRate === 'undefined') {
    lastAudioPlaybackRate = playbackFactor
  } else {
    // check if current playback rate / playbackFactor is much larger or smaller than lastAudioPlaybackRate
    if (
      playbackFactor >
      lastAudioPlaybackRate * (1 + MAX_ALLOWABLE_PLAYBACK_RATE_DIFFERENCE_PCT)
    ) {
      playbackFactor =
        lastAudioPlaybackRate * (1 + MAX_ALLOWABLE_PLAYBACK_RATE_DIFFERENCE_PCT)
    } else if (
      playbackFactor <
      lastAudioPlaybackRate * (1 - MAX_ALLOWABLE_PLAYBACK_RATE_DIFFERENCE_PCT)
    ) {
      playbackFactor =
        lastAudioPlaybackRate * (1 - MAX_ALLOWABLE_PLAYBACK_RATE_DIFFERENCE_PCT)
    }
    lastAudioPlaybackRate = playbackFactor
  }

  audioPlaybackRate = playbackFactor
  ssmlPart.audio.playbackRate = audioPlaybackRate
  return audioPlaybackRate
}

/// --- LISTEN MESSAGE SENDING
function getListenAudio(listenResponse, wordIndex) {
  // tell background to "return" audio URL and timepoints from firebase.
  // audio URL and timepoints "returned" async: via another message?
  // console.log(
  //   "sending message to background to get listen audio for tab id: ",
  //   spreedTabId
  // );
  chrome.runtime.sendMessage(
    {
      action: 'getListenAudio',
      listenResponse: listenResponse,
      wordIndex: wordIndex,
      spreedTabId: spreedTabId,
    },
    function (response) {}
  )
}

/// --- LISTEN MESSAGE HANDLERS
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  // console.log('message received:',request);

  switch (request.action) {
    case 'returnListenAudio':
      if (request.spreedTabId === spreedTabId) {
        console.log(
          'received message from background with audio. updating state.'
        )
        const returnListenAudioRequest = request

        parseReturnListenAudioRequest(returnListenAudioRequest)
      } else {
        console.log(
          'received message from background with audio but not for this swiftread window.'
        )
      }

      sendResponse({
        success: true,
      })
      break

    case 'forceUpdateAudio':
      if (request.spreedTabId === spreedTabId) {
        console.log(
          `force updating audio for ${request.wordIndex}, which has listen id ${request.listenId}`
        )
        forceUpdateAudio(request.wordIndex)
      } else {
        console.log(
          'received message from background to force update audio not for this swiftread window.'
        )
      }

      sendResponse({
        success: true,
      })
  }
})
