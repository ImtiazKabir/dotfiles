// console.log('in swiftread.com content script');

// listen for messages
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    // console.log('content script received message: ', request);
    // switch statement for request actions
    switch (request.action) {
        case 'writeDataToReadingTest':
            console.log('received writeDataToReadingTest request');
            localStorage.setItem('swiftreadData', JSON.stringify(request.data));
            console.log('done saving data');
            sendResponse({ success: true });
            break;
        default:
            break;
    }
});