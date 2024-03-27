let curExtractedMostVisiblePage
let currentTab

let chunks

let newPDFLoaded = true
let processedPDF = false
let fromPageTurn = false

// per page variables
let uaHeaderBottom
let uaFooterTop
let bodyFontSize

function onlyUnique(value, index, self) {
  return self.indexOf(value) === index
}
function median(values) {
  if (values.length === 0) return 0

  values.sort(function (a, b) {
    return a - b
  })

  var half = Math.floor(values.length / 2)

  if (values.length % 2) return values[half]

  return (values[half - 1] + values[half]) / 2.0
}

function isInParent(parent, child) {
  // console.log('parent:',parent);
  const parentBox = parent.getBoundingClientRect()
  // console.log('child:',child);
  const childBox = child.getBoundingClientRect()

  let result = true
  if (childBox.y > parentBox.y + parentBox.height || childBox.y < parentBox.y) {
    result = false
  }
  // console.log('child in parent:', result);
  return result
}
function getPageViewPcts(pages) {
  const viewerTop = outerContainer.getBoundingClientRect().y
  const viewerHeight = outerContainer.getBoundingClientRect().height

  return pages.map((page) => {
    // get page number of y-pixels visible
    // console.log(page);
    const pageNumber = parseInt(page.dataset.pageNumber) // TODO: this assumes pageNumber is an int
    const pageBounds = page.getBoundingClientRect()
    // console.log(pageBounds);

    let yPixelsVisible

    const onScreenYEnd = pageBounds.height + pageBounds.y // where the page y ends on screen
    const onScreenYStart = pageBounds.y

    if (
      onScreenYStart >= viewerTop &&
      onScreenYEnd <= viewerHeight + viewerTop
    ) {
      // page a subset in screen
      yPixelsVisible = onScreenYEnd - onScreenYStart
    } else if (
      onScreenYStart < viewerTop &&
      onScreenYEnd > viewerHeight + viewerTop
    ) {
      // page starts earlier, ends after screen
      yPixelsVisible = viewerHeight
    } else if (
      onScreenYStart < viewerTop &&
      onScreenYEnd <= viewerHeight + viewerTop
    ) {
      // page starts earlier, ends in screen
      yPixelsVisible = onScreenYEnd - viewerTop
    } else if (
      onScreenYStart > viewerTop &&
      onScreenYStart <= viewerHeight + viewerTop &&
      onScreenYEnd >= viewerHeight + viewerTop
    ) {
      // page starts in screen, ends after screen
      yPixelsVisible = viewerHeight + viewerTop - onScreenYStart
    } else {
      yPixelsVisible = 0
    }

    return {
      pageNumber,
      yPixelsVisible,
      pctOfViewer: yPixelsVisible / viewerHeight,
      page,
    }
  })
}
function getMostVisiblePages() {
  // get pages
  const pages = Array.prototype.slice.call(
    outerContainer.querySelectorAll('.page')
  )
  // console.log('pages:',pages);

  const pageViewPcts = getPageViewPcts(pages)
  // console.log('pageViewPcts:', pageViewPcts);

  return pageViewPcts
    .sort((a, b) => {
      if (a.pctOfViewer < b.pctOfViewer) return -1
      if (a.pctOfViewer > b.pctOfViewer) return 1
      return 0
    })
    .reverse()
}

function getLocationString() {
  const mostVisiblePages = getMostVisiblePages()
  if (mostVisiblePages.length > 0) {
    const pdfLocationString =
      'Page ' +
      mostVisiblePages[0].pageNumber.toString() +
      ' of ' +
      mostVisiblePages.length.toString()
    console.log('pdf location string:', pdfLocationString)
    chrome.runtime.sendMessage(
      { action: 'storeLocationString', locationString: pdfLocationString },
      function (response) {
        // console.log('pushEvent response:',response);
      }
    )
    return pdfLocationString
  } else {
    return ''
  }
}

function getPageForPageNumber(pageNumber) {
  return outerContainer.querySelector(`.page[data-page-number="${pageNumber}"]`)
}

async function processPDFRenderedText(pageNumber = undefined) {
  const outerContainer = document.getElementById('outerContainer')
  // console.log('outerContainer:',outerContainer);

  let mostVisiblePage
  if (!pageNumber) {
    // get page that is currently most visible
    const mostVisiblePages = getMostVisiblePages()
    // console.log('getting mostVisiblePages:', mostVisiblePages);

    if (mostVisiblePages.length === 0) {
      alert(
        'Error: no visible PDF page found. Please report to help@swiftread.com'
      )
      chrome.runtime.sendMessage(
        {
          action: 'pushEvent',
          eventCategory: 'error',
          eventAction: 'pdf-reader-zero-pages-detected',
        },
        function (response) {}
      )
    }

    mostVisiblePage = mostVisiblePages[0].page
    curExtractedMostVisiblePage = mostVisiblePages[0]
    // console.log('curExtractedMostVisiblePage:',curExtractedMostVisiblePage);
  } else {
    console.log('processing for specified page number: ', pageNumber)
    mostVisiblePage = getPageForPageNumber(pageNumber)
    console.log('mostVisiblePage: ', mostVisiblePage)
  }

  // get text layer of this page
  // wait until text layer is non-undefined
  function waitAndGetTextLayer(mostVisiblePage, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const interval = 100
      let tries = 0
      const maxTries = timeout / interval

      let wait = setInterval(function () {
        // console.log('waiting for text layer...');
        const textLayer = mostVisiblePage.querySelector('.textLayer')
        if (textLayer) {
          // console.log('text layer found');
          clearInterval(wait)
          resolve(textLayer)
        }

        tries += 1
        if (tries > maxTries) {
          clearInterval(wait)
          // console.error("Timed out while waiting for PDF text layer");
          chrome.runtime.sendMessage(
            {
              action: 'pushEvent',
              eventCategory: 'error',
              eventAction: 'pdf-reader-waiting-for-textLayer-timed-out',
            },
            function (response) {}
          )
          reject('Timed out while waiting for PDF text layer')
        }
      }, interval)
    })
  }
  const textLayer = await waitAndGetTextLayer(mostVisiblePage)

  // console.log('textLayer:', textLayer);
  // console.log('textLayer.getBoundingClientRect():', textLayer.getBoundingClientRect());

  if (!textLayer) {
    alert(
      'Error: PDF still loading. Please try again in a few seconds. If this issue persists, email help@swiftread.com'
    )
    chrome.runtime.sendMessage(
      {
        action: 'pushEvent',
        eventCategory: 'error',
        eventAction: 'pdf-still-loading',
      },
      function (response) {}
    )
  }

  function waitForTextLayerChunks(textLayer, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const interval = 100
      let tries = 0
      const maxTries = timeout / interval

      let wait = setInterval(function () {
        // console.log('waiting for text layer...');
        const curChunks = Array.prototype.slice.call(
          textLayer.querySelectorAll('*[role="presentation"]')
        )
        if (curChunks.length > 0) {
          // console.log('text layer found');
          clearInterval(wait)
          resolve(curChunks)
        }

        tries += 1
        if (tries > maxTries) {
          clearInterval(wait)
          // console.error("Timed out while waiting for PDF text layer");
          chrome.runtime.sendMessage(
            {
              action: 'pushEvent',
              eventCategory: 'error',
              eventAction: 'pdf-reader-waiting-for-chunks-timed-out',
            },
            function (response) {}
          )
          reject('Timed out while waiting for PDF content in text layer')
        }
      }, interval)
    })
  }
  chunks = await waitForTextLayerChunks(textLayer)

  // each "chunk" could be a line of words, headers, or even partial words (sometimes the renderer breaks up words)
  chunks = chunks.map((chunk) => {
    return {
      innerText: chunk.innerText,
      chunk: chunk,
      styles: chunk.style,
      include: true,
    }
  })
  // console.log('chunks: ', chunks);
  // console.log('num chunks: ', chunks.length);

  // filter out chunks that are not in the current text layer
  chunks = chunks.filter((chunk) => {
    if (chunk.chunk.tagName === 'BR') return true // keep BR tags even if they aren't "in" the parent
    return isInParent(textLayer, chunk.chunk)
  })
  // console.log('visible chunks: ', chunks);
  // console.log('num visible chunks: ', chunks.length);

  if (chunks.length === 0) {
    if (fromPageTurn === true) {
      // console.log('from page turn and no chunks to process, skipping...');
      return
    }
    alert(
      "This page doesn't seem to have any selectable text. SwiftRead only works on PDF pages where the text is selectable. If applicable, please scroll to a page in this PDF with selectable text to start SwiftReading from there."
    )
    chrome.runtime.sendMessage(
      {
        action: 'pushEvent',
        eventCategory: 'error',
        eventAction: 'pdf-reader-no-selectable-text',
      },
      function (response) {
        const oldClasses = document.getElementById('openSpreed').className
        document.getElementById('openSpreed').className = oldClasses.replaceAll(
          'loading',
          ''
        )
      }
    )
    processedPDF = false
    return
  }

  // NEW HEADER/FOOTER DETECTION LOGIC
  clearPageState(pageNumber)
  // create new graphics layer to do everything in, if it doesn't exist
  let graphicsLayer
  const existingGraphicsLayer =
    textLayer.parentNode.querySelectorAll('.graphicsLayer')
  if (existingGraphicsLayer.length > 0) {
    graphicsLayer = existingGraphicsLayer[0]
  } else {
    graphicsLayer = document.createElement('div')
    graphicsLayer.className = 'graphicsLayer'
    graphicsLayer.style.width = textLayer.style.width
    graphicsLayer.style.height = textLayer.style.height
    graphicsLayer.style.position = 'absolute'
    graphicsLayer.style.top = 0
    graphicsLayer.style.left = 0
    graphicsLayer.style.right = 0
    graphicsLayer.style.bottom = 0
    graphicsLayer.style.opacity = 1
    graphicsLayer.style.backgroundColor = 'transparent'

    textLayer.parentNode.prepend(graphicsLayer)
  }

  // font-size algorithm based header bottom or footer top
  let pHeaderBottom
  let pFooterTop
  // 1. determine body font-size, line-height
  // get array of [chunk font-size, chunk num words]
  const chunkSizes = chunks.map((chunkObj) => {
    if (chunkObj.chunk.tagName === 'BR') {
      // ignore BRs extracted from the PDF in determining PDF's font size word counts
      return {
        fontSize: 0,
        wordCount: 0,
      }
    } else {
      return {
        fontSize: parseFloat(chunkObj.styles.fontSize.replace('px', '')),
        wordCount: chunkObj.chunk.innerText.split(' ').length,
      }
    }
  })
  console.log('chunkSizes: ', chunkSizes)
  const totalWordCount = chunkSizes
    .map((obj) => obj.wordCount)
    .reduce((partialSum, a) => partialSum + a, 0)
  console.log('totalWordCount: ', totalWordCount)
  // 1.1. determine body font-size
  // calculate frequency distribution
  const fontSizesDist = {}
  for (const chunkSizeObj of chunkSizes) {
    const count = fontSizesDist[chunkSizeObj.fontSize] ?? 0
    fontSizesDist[chunkSizeObj.fontSize] = count + chunkSizeObj.wordCount
  }
  // console.log('fontSizesDist: ', fontSizesDist);
  const sortedFontSizes = Object.entries(fontSizesDist).sort(
    (a, b) => b[1] - a[1]
  ) // sort by word count
  console.log('sortedFontSizes: ', sortedFontSizes)
  // filter to font sizes that pass a % of words threshold: assumption is that the body font size will be the most frequent font size
  let bodyFontSizes = sortedFontSizes.filter(
    ([_, wordCount]) => wordCount / totalWordCount >= 0.3
  )
  console.log('potential bodyFontSizes: ', bodyFontSizes)
  if (bodyFontSizes.length > 0) {
    // pick the larger font size to be safe that it's not picking really word footnotes or something where the font-size is smaller
    const sortedBodyFontSizes = bodyFontSizes.sort(
      (objA, objB) => parseFloat(objB[0]) - parseFloat(objA[0])
    )
    bodyFontSize = parseFloat(sortedBodyFontSizes[0][0])
  }
  // bodyFontSizes could be null. if it is:
  else {
    const sortedFontSizesByFontSize = Object.entries(fontSizesDist).sort(
      (a, b) => a[0] - b[0]
    ) // sort by font size

    // take the most frequent font size
    const mostFrequentFontSize = [sortedFontSizes[0]]
    // find the font sizes that are within 15% of the most frequent font size
    const MOST_FREQUENT_FONT_SIZE_CLUSTER_THRESHOLD = 0.15
    const mostFrequentFontSizeVal = parseFloat(mostFrequentFontSize[0][0])
    const predictedBodyFontSizeCluster = sortedFontSizes.filter(
      ([fontSize, _]) => {
        return (
          Math.abs(parseFloat(fontSize) - mostFrequentFontSizeVal) <=
          mostFrequentFontSizeVal * MOST_FREQUENT_FONT_SIZE_CLUSTER_THRESHOLD
        )
      }
    )
    // console.log('predictedBodyFontSizeCluster: ', predictedBodyFontSizeCluster);
    // get the smallest font size in cluster
    const clusterFontSizes = predictedBodyFontSizeCluster
      .map(([fontSize, _]) => parseFloat(fontSize))
      .sort((a, b) => a - b)
    bodyFontSize = clusterFontSizes[0]
  }

  console.log('bodyFontSize: ', bodyFontSize)

  // 2. sort chunks by y-position/top, while preserving original order if there were any ties
  const ySortedTextChunks = chunks
    .slice()
    .filter((chunkObj) => chunkObj.chunk.tagName !== 'BR')
    .sort((chunkObjA, chunkObjB) => {
      const chunkATop = chunkObjA.chunk.getBoundingClientRect().top
      const chunkBTop = chunkObjB.chunk.getBoundingClientRect().top
      if (chunkATop !== chunkBTop) return chunkATop - chunkBTop
      else return chunks.indexOf(chunkObjA) - chunks.indexOf(chunkObjB)
    })
  // console.log('ySortedChunks: ', ySortedTextChunks);

  // 3. header detection: start from top, go down until body font-size is detected
  // exception: chunk is very narrow (probably a page number)
  const MIN_HEADER_FOOTER_MARGIN_SIZE = 5
  const graphicsLayerHeight = parseFloat(
    graphicsLayer.style.height.replace('px', '')
  )
  const numberRegex = /^\d+$/gm
  const DEFAULT_HEADER_FOOTER_PROP = 0.05
  pHeaderBottom = MIN_HEADER_FOOTER_MARGIN_SIZE
  const defaultFsHeaderBottom = pHeaderBottom
  for (const chunkObj of ySortedTextChunks) {
    const curFontSize = parseFloat(chunkObj.styles.fontSize.replace('px', ''))
    const curChunkTop = parseFloat(chunkObj.styles.top.replace('px', ''))

    if (!curFontSize) continue

    if (curChunkTop < pHeaderBottom) continue // skip if chunk is before default header

    if (curFontSize >= bodyFontSize) {
      const bodyText = chunkObj.chunk.innerText
      // console.log('bodyText: ', bodyText);
      if (numberRegex.test(bodyText)) {
        // if the chunk is only digits, it's probably a page number, so continue
        continue
      }

      // console.log('curChunkTop: ', curChunkTop);
      if (curChunkTop > pHeaderBottom) pHeaderBottom = curChunkTop
      break
    }
  }
  // console.log('pHeaderBottom: ', pHeaderBottom);
  // 4. footer detection: start from bottom, go up until body font-size is detected
  // exception: chunk is very narrow (probably a page number)
  pFooterTop = graphicsLayerHeight - MIN_HEADER_FOOTER_MARGIN_SIZE
  const defaultFsFooterTop = pFooterTop
  const ySortedChunksReversed = [...ySortedTextChunks].reverse()
  for (const chunkObj of ySortedChunksReversed) {
    const curFontSize = parseFloat(chunkObj.styles.fontSize.replace('px', ''))
    const curChunkBottom =
      parseFloat(chunkObj.styles.top.replace('px', '')) +
      chunkObj.chunk.getBoundingClientRect().height

    if (curFontSize >= bodyFontSize) {
      const bodyText = chunkObj.chunk.innerText
      // console.log('bodyText: ', bodyText);
      if (numberRegex.test(bodyText)) {
        // if the chunk is only digits, it's probably a page number, so continue
        continue
      }

      // console.log('curChunkBottom: ', curChunkBottom);
      if (curChunkBottom < pFooterTop) pFooterTop = curChunkBottom
      break
    }
  }

  // 5. if predicted header and/or footer are too large, reset to default
  const MAX_HEADER_FOOTER_PROP = 0.4
  if (pHeaderBottom > graphicsLayerHeight * MAX_HEADER_FOOTER_PROP) {
    pHeaderBottom = defaultFsHeaderBottom
  }
  if (
    pFooterTop <
    graphicsLayerHeight - graphicsLayerHeight * MAX_HEADER_FOOTER_PROP
  ) {
    pFooterTop = defaultFsFooterTop
  }

  // show in DOM the header bottom and footer bottom
  const ADJUSTER_HEIGHT = 3
  const headerMarginEl = document.createElement('div')
  headerMarginEl.id = 'sr-pdf-header-margin'
  headerMarginEl.className = 'sr-pdf-vertical-margin'
  headerMarginEl.style.top = '0px'
  headerMarginEl.style.height = (uaHeaderBottom ?? pHeaderBottom) + 'px'
  graphicsLayer.appendChild(headerMarginEl)

  const footerMarginEl = document.createElement('div')
  footerMarginEl.id = 'sr-pdf-footer-margin'
  footerMarginEl.className = 'sr-pdf-vertical-margin'
  footerMarginEl.style.bottom = '0px'
  footerMarginEl.style.height =
    graphicsLayerHeight - (uaFooterTop ?? pFooterTop) + 'px'
  graphicsLayer.appendChild(footerMarginEl)

  // append the adjusters to the textLayer, which is top most, so that they can be clicked on
  const headerAdjuster = document.createElement('div')
  headerAdjuster.id = 'sr-pdf-header-adjuster'
  headerAdjuster.className = 'sr-pdf-vertical-margin-adjuster'
  headerAdjuster.style.top = (uaHeaderBottom ?? pHeaderBottom) + 'px'
  headerAdjuster.style.height = ADJUSTER_HEIGHT + 'px'
  textLayer.appendChild(headerAdjuster)

  const footerAdjuster = document.createElement('div')
  footerAdjuster.id = 'sr-pdf-footer-adjuster'
  footerAdjuster.className = 'sr-pdf-vertical-margin-adjuster'
  footerAdjuster.style.top = (uaFooterTop ?? pFooterTop) + 'px'
  footerAdjuster.style.height = ADJUSTER_HEIGHT + 'px'
  textLayer.appendChild(footerAdjuster)

  function filterChunksInHeaderFooter(headerBottom, footerTop) {
    // clear any previously colored excluded chunks
    const coloredChunkEls = document.querySelectorAll('.sr-pdf-chunk-excluded')
    for (const el of coloredChunkEls) {
      el.remove()
    }

    // filter and color the chunks that would be in header or footer
    for (const chunkObj of chunks) {
      // console.log('chunkObj: ', chunkObj);
      const chunkEl = chunkObj.chunk
      const chunkBounds = chunkEl.getBoundingClientRect()
      const chunkStyles = chunkObj.styles
      const chunkTop = parseFloat(chunkStyles.top.replace('px', ''))

      if (chunkEl.tagName === 'BR') {
        continue
      } // do not filter out any BRs from the PDF

      // then, exclude and color any chunks that are in header/footer
      if (!(chunkTop >= headerBottom && chunkTop <= footerTop)) {
        // console.log('chunk in header or footer: ', chunkObj, chunkTop, headerBottom, footerTop);
        // insert it over the chunk to prevent selection of the text
        graphicsLayer.insertAdjacentHTML(
          'beforeend',
          `
					<div class='sr-pdf-chunk-excluded' style='top: ${chunkStyles.top}; left: ${
            chunkStyles.left
          }; width: ${Math.ceil(chunkBounds.width)}px; height: ${Math.ceil(
            chunkBounds.height
          )}px;'></div>
				`
        )
        chunkObj.include = false
      } else {
        chunkObj.include = true
      }
    }
  }

  const MAX_HEADER_FOOTER_MARGIN_SIZE_PCT = 0.4
  $('.sr-pdf-vertical-margin-adjuster').draggable({
    axis: 'y',
    start: function (event, ui) {},
    drag: function (event, ui) {
      if (event.target.id === 'sr-pdf-header-adjuster') {
        $('#sr-pdf-header-margin').css('height', ui.position.top)
      } else if (event.target.id === 'sr-pdf-footer-adjuster') {
        $('#sr-pdf-footer-margin').css(
          'height',
          graphicsLayerHeight - ui.position.top
        )
      }
    },
    stop: function (event, ui) {
      if (event.target.id === 'sr-pdf-header-adjuster') {
        // if header was dragged to smaller than min header size
        if (ui.position.top < MIN_HEADER_FOOTER_MARGIN_SIZE) {
          event.target.style.top = MIN_HEADER_FOOTER_MARGIN_SIZE + 'px'
          $('#sr-pdf-header-margin').css('height', event.target.style.top)
        }
        // if header was dragged to bigger than max header size
        else if (
          ui.position.top / graphicsLayerHeight >
          MAX_HEADER_FOOTER_MARGIN_SIZE_PCT
        ) {
          event.target.style.top =
            Math.floor(
              MAX_HEADER_FOOTER_MARGIN_SIZE_PCT * graphicsLayerHeight
            ) + 'px'
          $('#sr-pdf-header-margin').css('height', event.target.style.top)
        }
        uaHeaderBottom = ui.position.top
      } else if (event.target.id === 'sr-pdf-footer-adjuster') {
        // console.log('footer size: ', (graphicsLayerHeight - ui.position.top));
        // console.log('graphicsLayerHeight: ', graphicsLayerHeight);

        // if footer was dragged to smaller than min header size
        if (
          graphicsLayerHeight - ui.position.top <
          MIN_HEADER_FOOTER_MARGIN_SIZE
        ) {
          event.target.style.top =
            graphicsLayerHeight - MIN_HEADER_FOOTER_MARGIN_SIZE + 'px'
          $('#sr-pdf-footer-margin').css(
            'height',
            MIN_HEADER_FOOTER_MARGIN_SIZE
          )
        }
        // if footer was dragged to bigger than max footer size
        else if (
          (graphicsLayerHeight - ui.position.top) / graphicsLayerHeight >
          MAX_HEADER_FOOTER_MARGIN_SIZE_PCT
        ) {
          // console.log('footer dragged to larger than max height allowed!!!');
          event.target.style.top =
            Math.floor(
              graphicsLayerHeight -
                MAX_HEADER_FOOTER_MARGIN_SIZE_PCT * graphicsLayerHeight
            ) + 'px'
          $('#sr-pdf-footer-margin').css(
            'height',
            MAX_HEADER_FOOTER_MARGIN_SIZE_PCT * graphicsLayerHeight
          )
        }
        uaFooterTop = ui.position.top
      }
      // re-filter and re-render chunk coloring
      filterChunksInHeaderFooter(
        uaHeaderBottom ?? pHeaderBottom,
        uaFooterTop ?? pFooterTop
      )
    },
  })

  // filter and render chunk coloring based on header bottom and footer top
  filterChunksInHeaderFooter(
    uaHeaderBottom ?? pHeaderBottom,
    uaFooterTop ?? pFooterTop
  )

  // // SUPERSCRIPT AND OTHER EXTRANEOUS TEXT EXCLUSION
  // // TO IMPLEMENT 10/27/22: deprioritized
  // // DEBUG: color chunks that have font-size smaller than body font-size
  // for (const chunkObj of chunks) {
  // 	const chunkFontSize = parseFloat(chunkObj.chunk.style.fontSize.replace("px", ""));
  // 	if (chunkFontSize < bodyFontSize) {
  // 		chunkObj.chunk.style.backgroundColor = "yellow";
  // 	} else if (chunkFontSize > bodyFontSize) {
  // 		chunkObj.chunk.style.backgroundColor = "green";
  // 	}
  // }

  processedPDF = true
  // console.log('processedPDF:', processedPDF);
}
function clearPageState(inputPageNumber) {
  let pageNumber
  if (!inputPageNumber) {
    // get page that is currently most visible
    const mostVisiblePages = getMostVisiblePages()
    // console.log('getting mostVisiblePages:', mostVisiblePages);

    if (mostVisiblePages.length === 0) {
      alert(
        'Error: no visible PDF page found. Please report to help@swiftread.com'
      )
      chrome.runtime.sendMessage(
        {
          action: 'pushEvent',
          eventCategory: 'error',
          eventAction: 'pdf-reader-zero-pages-detected',
        },
        function (response) {}
      )
    }

    const mostVisiblePage = mostVisiblePages[0].page
    pageNumber = parseInt(mostVisiblePage.dataset.pageNumber)
  } else {
    console.log('processing for specified page number: ', inputPageNumber)
    pageNumber = inputPageNumber
  }

  const pageEl = getPageForPageNumber(pageNumber)
  // remove any elements in text layer with class prefix sr-pdf, which should remove any attached listeners
  const srPdfEls = pageEl.querySelectorAll('div[class^="sr-pdf"]')
  for (const srPdfEl of srPdfEls) {
    srPdfEl.remove()
  }

  // remove the graphics layer
  const els = pageEl.querySelectorAll('.graphicsLayer')
  for (const el of els) {
    el.remove()
  }
}
async function extractPDFRenderedText() {
  // console.log('EXTRACTING TEXT FROM PDF...');
  // console.log('fromPageTurn: ', fromPageTurn);

  // only process PDF if it hasn't been procesesed yet, e.g. if page turned, should be processed already on load
  const mostVisiblePageNumber = getMostVisiblePages()[0].pageNumber
  if (processedPDF === false) {
    // console.log('this page not processed yet, processing...');
    await processPDFRenderedText()
  } else if (mostVisiblePageNumber !== curExtractedMostVisiblePage.pageNumber) {
    // console.log('newly visible page not processed yet, processing...');
    await processPDFRenderedText()
  }

  // LOGIC TO SPACE TEXT CORRECTLY FOR DISPLAY IN SWIFTREAD
  // detect "normal" line breaks vs. new paragraphs, and spaces
  let chunksWBreaks = []
  const includedChunks = chunks.filter((chunkObj) => chunkObj.include)
  // console.log('includedChunks: ', includedChunks);

  // first, calculate the standard line start positions
  const includedTextChunks = includedChunks.filter(
    (chunkObj) => chunkObj.chunk.tagName !== 'BR'
  )
  // filter out chunks that have "roughly" same top position as the previous chunk, which means that it's part of the same line
  const filteredLineStarts = []
  const SAME_LINE_BUFFER_PCT = 0.5
  for (let i = 0; i < includedTextChunks.length; i++) {
    const curChunk = includedTextChunks[i]
    const curChunkLeft = parseFloat(curChunk.chunk.style.left.replace('px', ''))
    const curChunkTop = parseFloat(curChunk.chunk.style.top.replace('px', ''))
    const curChunkHeight = curChunk.chunk.getBoundingClientRect().height
    if (i == 0) {
      filteredLineStarts.push([curChunkLeft, curChunk])
    } else {
      const prevChunk = includedTextChunks[i - 1]
      const prevChunkLeft = parseFloat(
        prevChunk.chunk.style.left.replace('px', '')
      )
      const prevChunkTop = parseFloat(
        prevChunk.chunk.style.top.replace('px', '')
      )
      const prevChunkHeight = prevChunk.chunk.getBoundingClientRect().height
      const bufferHeight = SAME_LINE_BUFFER_PCT * prevChunkHeight
      if (
        curChunkTop > prevChunkTop - bufferHeight &&
        curChunkTop + curChunkHeight <
          prevChunkTop + prevChunkHeight + bufferHeight
      ) {
        // console.log('current chunk seems to be on the same line as previous chunk: ', curChunk, prevChunk);
        curChunk.newLineStart = false
        continue
      } else {
        // console.log('current chunk on different line than previous chunk, pushing', curChunk);
        filteredLineStarts.push([curChunkLeft, curChunk])

        curChunk.newLineStart = true
      }
    }
  }
  // console.log('filteredChunkStarts: ', filteredLineStarts);
  let probableColumnStarts = new Set()
  for (let i = 0; i < filteredLineStarts.length; i++) {
    const curLineStart = filteredLineStarts[i][0]
    if (i == 0) continue
    else {
      const prevLineStart = filteredLineStarts[i - 1][0]
      if (prevLineStart == curLineStart) probableColumnStarts.add(curLineStart)
    }
  }
  probableColumnStarts = [...probableColumnStarts]
  // console.log('probableColumnStarts: ', probableColumnStarts);

  // filter to font sizes that pass a % of words threshold
  // const lineStarts = sortedLineStarts.filter(([fontSize, wordCount]) => wordCount / totalWordCount >= 0.3);
  // console.log('potential lineStarts: ', lineStarts);

  let previousTextChunk
  for (let i = 0; i < includedChunks.length; i++) {
    const currentChunk = includedChunks[i]
    // console.log('currentChunk: ', currentChunk);

    if (currentChunk.chunk.tagName === 'BR') {
      // console.log("is a BR, replacing with a space");
      chunksWBreaks.push({ innerText: ' ' })
    } else {
      // otherwise, it's a text chunk
      // console.log("is a text chunk");
      const currentTextChunk = currentChunk
      const currentTextChunkLeft = parseFloat(
        currentChunk.chunk.style.left.replace('px', '')
      )
      let previousTextChunkBounds
      if (previousTextChunk) {
        previousTextChunkBounds =
          previousTextChunk.chunk.getBoundingClientRect()
        // console.log('previousTextChunk: ', previousTextChunk, previousTextChunkBounds);
      } else {
        // console.log("is FIRST text chunk");
      }
      const currentTextChunkBounds =
        currentTextChunk.chunk.getBoundingClientRect()
      // console.log('currentTextChunk: ', currentTextChunk, currentTextChunkBounds);

      // IGNORE SUPERSCRIPT LOGIC
      const SUPERSCRIPT_TOP_BUFFER_PCT = 0.25
      const SUPERSCRIPT_MAX_HEIGHT_PCT = 0.75
      const SUPERSCRIPT_MIN_HEIGHT_PCT = 0.35
      // if current text chunk top is at roughly same position as previous text chunk
      // and it's a good amount smaller, assume superscript and exclude
      // and current text chunk is a digit/list of digits
      const digitOrDigitListRegex = /^(([1-9]+,?\s?)+)$/g
      // and previous text chunk ends in a lower case letter or period, exclamation, question, semicolon, colon, comma, or whitespace
      const previousEndsInLowerOrPunctuationRegex = /[a-z.!?,:;\s+]$/g
      if (
        previousTextChunkBounds &&
        currentTextChunkBounds.top >=
          previousTextChunkBounds.top -
            previousTextChunkBounds.height * SUPERSCRIPT_TOP_BUFFER_PCT &&
        currentTextChunkBounds.top <=
          previousTextChunkBounds.top +
            previousTextChunkBounds.height * SUPERSCRIPT_TOP_BUFFER_PCT &&
        currentTextChunkBounds.height <=
          SUPERSCRIPT_MAX_HEIGHT_PCT * previousTextChunkBounds.height &&
        currentTextChunkBounds.height >=
          SUPERSCRIPT_MIN_HEIGHT_PCT * previousTextChunkBounds.height &&
        digitOrDigitListRegex.test(currentTextChunk.innerText) &&
        previousEndsInLowerOrPunctuationRegex.test(previousTextChunk.innerText)
      ) {
        // "exclude" this chunk by moving onto the next chunk
        continue
      }

      // SPACING LOGIC
      // otherwise, check if this chunk is should be on a new (extra newline spaced) paragraph
      const NEWLINE_HEIGHT_MULTIPLE = 2
      if (
        previousTextChunkBounds &&
        currentChunk.newLineStart === true &&
        currentTextChunkBounds.y >
          (NEWLINE_HEIGHT_MULTIPLE - 1) * previousTextChunkBounds.height +
            (previousTextChunkBounds.y + previousTextChunkBounds.height)
      ) {
        chunksWBreaks.push({ innerText: '<br/><br/>' })
      }
      // otherwise, check if it is still on a newline from previous chunk
      else if (
        currentChunk.newLineStart === true &&
        currentTextChunkBounds.y >
          previousTextChunkBounds.y + previousTextChunkBounds.height
      ) {
        // but the chunk is indented inwards from known line start positions
        const MIN_INDENT_SIZE_FOR_PARAGRAPH = 5
        const closestColumnStart = probableColumnStarts
          .filter((columnStart) => columnStart <= currentTextChunkLeft)
          .sort((a, b) => b - a)

        if (
          closestColumnStart.length > 0 &&
          closestColumnStart[0] == currentTextChunkLeft
        ) {
          // this line start seems to right on the closest actual column start, continue
        } else {
          // this line seems to start indented from the closest actual column start.
          if (
            currentTextChunkLeft - MIN_INDENT_SIZE_FOR_PARAGRAPH >=
            closestColumnStart[0]
          ) {
            chunksWBreaks.push({ innerText: '<br/><br/>' })
          }
        }
      }

      // push the actual text chunk after any spacing was pushed above
      chunksWBreaks.push(currentTextChunk)
      previousTextChunk = currentChunk
    }
  }
  // console.log('chunksWBreaks:',chunksWBreaks);

  // join everything together
  const finalHTML = chunksWBreaks.map((obj) => obj.innerText).join('')

  // TODO: detect headers to bold? look at transform: scaleX (and keep track of it per character count)?

  // console.log("finalHTML:", finalHTML);

  return finalHTML
}

function sendMessagePromise(messagePayload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(messagePayload, function (response) {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message
        console.error(
          'Error when sending message ' + JSON.stringify(messagePayload)
        )
        reject(errorMsg)
      }

      if (
        response &&
        response.hasOwnProperty('success') &&
        response.success === true
      ) {
        resolve()
      } else {
        console.error(
          'The following message payload did not respond successfully: ' +
            JSON.stringify(messagePayload)
        )
        reject(messagePayload)
      }
    })
  })
}

async function sendExtractedTextAndOpenSpreed(html, setVarsForPageTurn = true) {
  // set variables needed for left/right page turn
  let setCurrentTabIdPromise
  let domain = window.location.href // set as full url
  if (setVarsForPageTurn) {
    // set currentDomain so that spreed knows the "source"
    // console.log('setting domain:',domain);
    sendMessagePromise({ action: 'setVarsForPageTurn', currentDomain: domain })

    // set currentTabId so that spreed knows which tab it's coming from
    const currentTab = await getCurrentTab()
    if (!currentTab) {
      console.error('currentTab not set for some reason, it should have been')
      chrome.runtime.sendMessage(
        {
          action: 'pushEvent',
          eventCategory: 'error',
          eventAction: 'pdf-reader-no-currentTab-in-autoextract',
        },
        function (response) {}
      )
    } else {
      // console.log('setting current tab id:',currentTab.id);
      setCurrentTabIdPromise = sendMessagePromise({
        action: 'setVarsForPageTurn',
        currentTabId: currentTab.id,
      })
    }
  } else {
    // unset the variables needed to disable page turn
    setCurrentTabIdPromise = sendMessagePromise({
      action: 'setVarsForPageTurn',
      currentDomain: null,
      currentTabId: null,
    })
  }

  // send recording event async
  chrome.runtime.sendMessage(
    {
      action: 'pushEvent',
      eventCategory: 'read-format',
      eventAction: 'extract-text',
      eventLabel: 'pdf',
    },
    function (response) {}
  )
  trackEvent('Extract Text', {
    source: 'PDF Reader',
  })

  // set metadata: in the future, won't need to do this manually because should have a "pdf reader content loader"
  await sendMessagePromise({
    action: 'setMetadata',
    metadata: {
      url: domain,
      domain: domain,
      title: document.title,
    },
  })

  setCurrentTabIdPromise
    .then(
      () => {
        // send extracted text
        // console.log('sending extracted text...');
        return sendMessagePromise({
          action: 'extractor',
          html: html,
          keepRaw: true,
        })
      },
      (errorMsg) => {
        alert(
          'Error extracting text: ' +
            errorMsg +
            ' \n\nPlease close this tab, re-open it, and try again. If this error re-occurs, please email help@swiftread.com with a screenshot.'
        )
      }
    )
    .then(
      () => {
        // open reader
        // console.log('opening window...');
        chrome.runtime.sendMessage(
          { action: 'openReader' },
          function (response) {
            if (response && response.success) {
              setTimeout(() => {
                const oldClasses =
                  document.getElementById('openSpreed').className
                document.getElementById('openSpreed').className =
                  oldClasses.replaceAll('loading', '')
              }, 1000)
            }
          }
        )
      },
      (errorMsg) => {
        alert(
          'Error extracting text: ' +
            errorMsg +
            ' \n\nPlease close this tab, re-open it, and try again. If this error re-occurs, please email help@swiftread.com with a screenshot.'
        )
      }
    )
}

function openSpreedOnPDF() {
  checkShowPDF(async function () {
    fromPageTurn = false

    // extract rendered text
    const html = await extractPDFRenderedText()
    // open spreed with it
    await sendExtractedTextAndOpenSpreed(html)
  })
}

function getCurrentTab() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'getCurrentTab' },
      function (response) {
        if (response && response.success === true) {
          resolve(response.tab)
        } else {
          alert(
            'Error setting up SwiftRead. Please close this tab, re-open it, and try again. For help, email help@swiftread.com'
          )
          reject()
        }
      }
    )
  })
}
function currentTabIsActive() {
  return new Promise(async (resolve, reject) => {
    const currentTab = await getCurrentTab()
    chrome.tabs.query({ currentWindow: true, active: true }, function (tabs) {
      var activeTab = tabs[0]
      console.log(activeTab, currentTab)
      if (activeTab.id === currentTab.id) resolve(true)
      else resolve(false)
    })
  })
}
function _getPagesWithText() {
  const outerContainer = document.getElementById('outerContainer')
  // console.log('outerContainer:',outerContainer);

  // get pages
  const pages = Array.prototype.slice.call(
    outerContainer.querySelectorAll('.page')
  )
  // console.log('pages:', pages);

  if (pages.length > 0) {
    // if there are pages:
    // get if there are text layers in any of the pages
    let textLayers = []
    for (let p = 0; p < pages.length; p++) {
      const curTextLayers = Array.prototype.slice.call(
        pages[p].querySelectorAll('.textLayer')
      )
      Array.prototype.push.apply(textLayers, curTextLayers)
    }
    // console.log('extended textLayers:', textLayers);

    const textLayersWithText = textLayers.filter(
      (t) => t.textContent.length > 0
    )
    if (textLayersWithText.length > 0) {
      // console.log('some text layers do have content:',textLayersWithText);
      return pages
    } else {
      // console.log('no text layer has content yet...');
      return []
    }
  } else {
    // no pages detected
    return []
  }
}
async function pdfDidLoad(timeout = 15000) {
  return new Promise((resolve, reject) => {
    const interval = 100
    let tries = 0
    const maxTries = timeout / interval

    let wait = setInterval(function () {
      // console.log('checking if pdf has loaded...');
      const pagesWithText = _getPagesWithText()
      // console.log('pagesWithText.length: ', pagesWithText.length);

      if (pagesWithText.length > 0) {
        // console.log('resolving true');
        clearInterval(wait)
        resolve(true)
      }

      tries += 1
      if (tries > maxTries) {
        clearInterval(wait)
        console.error('Timed out while loading PDF')
        resolve(false)
      }
    }, interval)
  })
}

// ON LOAD
window.addEventListener('DOMContentLoaded', async function () {
  const backgroundStorage = await initializeBackgroundStorage()

  // get current tab
  // console.log('getting current tab...');
  const currentTab = await getCurrentTab() // TODO: can this fail?

  // wait for pdf to load
  // console.log('waiting for pdf to load...');
  let pdfLoaded = await pdfDidLoad()
  if (pdfLoaded === true) {
    // set up custom event listeners
    // swiftread button click
    let openSpreedButton = document.getElementById('openSpreed')
    openSpreedButton.addEventListener('click', async function (event) {
      this.className += ' loading'
      await backgroundStorage.setSetting(backgroundStorage.OPEN_MODE, 10)
      openSpreedOnPDF()
    })
    // open file
    let openFileInput = document.getElementById('fileInput')
    // console.log('openFileInput: ', openFileInput);
    openFileInput.addEventListener('change', async function (event) {
      // file changed, reprocess
      const pdfLoaded = await pdfDidLoad()
      if (pdfLoaded === true) {
        console.log('pdf loaded. re-processing...')
        newPDFLoaded = true
        await processPDFRenderedText()
      } else {
        // console.log('pdf did not load / have any content');
        alert(
          "This PDF doesn't seem to have any selectable text. SwiftRead only works on PDFs where the text is selectable."
        )

        chrome.runtime.sendMessage(
          {
            action: 'pushEvent',
            eventCategory: 'error',
            eventAction: 'pdf-reader-no-selectable-text-newly-opened-pdf',
          },
          function (response) {
            const oldClasses = document.getElementById('openSpreed').className
            document.getElementById('openSpreed').className =
              oldClasses.replaceAll('loading', '')
          }
        )
      }
    })

    // console.log('processing...');
    await processPDFRenderedText()
  } else {
    alert(
      'Error: Empty PDF, or PDF taking too long to load. Try a smaller PDF or email help@swiftread.com for help.'
    )
  }
})
// listen to chrome command to auto extract
chrome.commands.onCommand.addListener(async function (command) {
  // make sure command is on this tab / this tab is active
  const isOnCurrentTab = await currentTabIsActive()
  //   console.log("chrome command detected. isOnCurrentTab:", isOnCurrentTab);

  const backgroundStorage = await initializeBackgroundStorage()

  if (isOnCurrentTab && command === 'open-spreed') {
    document.getElementById('openSpreed').className += ' loading'
    // check if there's selected text
    var selection = window.getSelection()

    if (selection.rangeCount > 0 && selection.toString().length > 0) {
      //   console.log("detected selection");
      await backgroundStorage.setSetting(backgroundStorage.OPEN_MODE, 3)
      const text = selection.toString()
      // send and open, but disable page turn
      checkShowPDF(async function () {
        console.log('opening spreed with selected text...')
        await sendExtractedTextAndOpenSpreed(text, (setVarsForPageTurn = false))
      })
    } else {
      // if there's no selected text, auto-extract
      console.log('no selection detected, auto-extracting...')
      await backgroundStorage.setSetting(backgroundStorage.OPEN_MODE, 1)
      openSpreedOnPDF()
    }
  }
})

function getUserIsPRO() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'userIsPRO' }, function (response) {
      // console.log('userIsPRO message response:', response);
      if (response && response.success === true) resolve(response.isPRO)
      else reject()
    })
  })
}
async function checkShowPDF(callback) {
  // get if user is a PRO user. if so, redirect to PDF reader
  //   console.log("checking if user is PRO...");
  const userIsPRO = await getUserIsPRO()
  if (userIsPRO === true) {
    // execute normally
    // console.log("user is PRO, executing normally");
    callback()
  } else {
    // otherwise, redirect to landing page with explanation
    // console.log("user is not PRO, redirecting to PRO landing page");
    chrome.runtime.sendMessage(
      { action: 'redirectToPaid', featureName: 'pdf_reader' },
      function (response) {}
    )
  }
}

// SET UP MESSAGE LISTENERS
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  // console.log('message received:',request);

  let sourceTabId
  switch (request.action) {
    case 'openReader':
      if (request.sourceType === 'pdf') {
        openSpreedOnPDF()
        sendResponse({
          success: true,
        })
      }
      break
    case 'getLocationString':
      if (request.sourceType === 'pdf') {
        const locationString = getLocationString()
        sendResponse({
          locationString,
        })
      }

      break

    case 'pdfPageTurn':
      ;(async () => {
        fromPageTurn = true

        // "turn page" by scrolling down to next page after the one we just extracted
        sourceTabId = request.sourceTabId
        const forward = request.forward

        if (!curExtractedMostVisiblePage) {
          chrome.runtime.sendMessage(
            {
              action: 'pushEvent',
              eventCategory: 'error',
              eventAction: 'pdf-reader-curExtractedMostVisiblePage-never-set',
            },
            function (response) {}
          )
          return
        }

        const curPageNumber = curExtractedMostVisiblePage.pageNumber
        // console.log('curPageNumber:',curPageNumber);
        const newPageNumber = forward ? curPageNumber + 1 : curPageNumber - 1
        // console.log('newPageNumber:',newPageNumber);

        const newPage = document.querySelector(
          `#outerContainer .page[data-page-number="${newPageNumber}"]`
        )
        // console.log('newPage:',newPage);

        if (!newPage) {
          // there wasn't a next page
          sendResponse({ success: false, status: 'no-next-page' })
          return
        }

        // physically scroll to it
        newPage.scrollIntoView()

        // extract content but retrieve it
        const html = await extractPDFRenderedText()

        sendResponse({
          success: true,
        })

        // send it to reader and reload
        chrome.runtime.sendMessage(
          { action: 'reloadReader', extractedContent: html },
          function (response) {}
        )
      })()
  }

  return true
})

// add pdf viewer event listeners
document.addEventListener('webviewerloaded', () => {
  PDFViewerApplication.initializedPromise.then(() => {
    PDFViewerApplication.eventBus.on('openfile', (e) => {
      console.log('open file clicked')
    })

    PDFViewerApplication.eventBus.on('documentloaded', (e) => {
      console.log('pdf document loaded')

      // console.log('PDFViewerApplication: ', PDFViewerApplication);
      PDFViewerApplication.pdfDocument
        .getPage(PDFViewerApplication.page)
        .then(function (page) {
          console.log('page: ', page)
        })

      // reset state for header/footer logic
      uaHeaderBottom = undefined
      uaFooterTop = undefined
    })

    PDFViewerApplication.eventBus.on('fileinputchange', (e) => {
      console.log('file input changed: ', e)
    })

    PDFViewerApplication.eventBus.on('pagechanging', (e) => {
      processedPDF = false

      console.log('pagechanging, from ' + e.previous + ' to ' + e.pageNumber)

      PDFViewerApplication.pdfDocument
        .getPage(e.pageNumber)
        .then(async function (page) {
          console.log('page: ', page)
          // clear state on previous page
          clearPageState(e.previous)
          // process current page
          await processPDFRenderedText(e.pageNumber)
        })
    })

    PDFViewerApplication.eventBus.on('scalechanging', (e) => {
      console.log('scalechanging, scale ' + e.scale)
    })
  })
})
