// console.log('Hello from SwiftRead app content script')

const checkForTokens = async (beforeComplete: () => void) => {
  const url = new URL(window.location.href)
  //   console.log("checking url for tokens: ", url);
  // if url has accessToken and refreshToken, send them to background script
  const params = url.searchParams
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')

  if (accessToken && refreshToken) {
    console.log('got tokens: ', accessToken, refreshToken)
    beforeComplete()

    // first, reset the access and refresh tokens in storage
    await chrome.storage.local.remove(['accessToken', 'refreshToken'])
    // set them in chrome storage
    await chrome.storage.local.set({
      accessToken: accessToken,
      refreshToken: refreshToken,
    })
    console.log('set tokens in chrome storage')
  }
}

const initSignInContentScript = async () => {
  console.log('initializing sign in content script')
  // every half second, check if the url has the access and refresh tokens
  const interval = setInterval(() => {
    checkForTokens(() => {
      clearInterval(interval)
    })
  }, 500)
}

const urlString = window.location.href
if (urlString.includes('auth/sign-in')) {
  initSignInContentScript()
}
