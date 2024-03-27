function getRandomToken() {
  // E.g. 8 * 32 = 256 bits token
  var randomPool = new Uint8Array(32);
  crypto.getRandomValues(randomPool);
  var hex = "";
  for (var i = 0; i < randomPool.length; ++i) {
    hex += randomPool[i].toString(16);
  }
  // E.g. db18458e2782b2b77e36769c569e263a53885a9944dd0a861e5064eac16f1a
  return hex;
}

const GA_TRACKING_ID = "UA-35748958-3";

function getClientId() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get("clientid", function (items) {
      var clientid = items.clientid;
      if (clientid) {
        useToken(clientid);
      } else {
        clientid = getRandomToken();
        chrome.storage.sync.set({ clientid: clientid }, function () {
          useToken(clientid);
        });
      }
      function useToken(clientid) {
        resolve(clientid);
      }
    });
  });
}

async function pushEvent(category, action, label, value) {
  if (typeof label === "undefined") {
    label = null;
  }
  if (typeof value === "undefined") {
    value = null;
  }

  const clientId = await getClientId();

  if (typeof clientId !== "undefined") {
    try {
      let message =
        "v=1&tid=" +
        GA_TRACKING_ID +
        "&cid= " +
        clientId +
        "&t=event&ec=" +
        category +
        "&ea=" +
        action;

      if (label != null) {
        message += "&el=" + label;
      }
      if (value != null) {
        message += "&ev=" + value;
      }

      const response = await fetch("https://www.google-analytics.com/collect", {
        method: "POST",
        body: message,
      });
      // console.log('Sent GA event with response: ', category, action, response);
    } catch (e) {
      console.warn("Error sending event to Google Analytics.\n" + e);
    }
  } else {
    console.warn("Cannot send event, clientId not set: ", clientId);
  }
}

if (typeof module === "object") {
  module.exports = { pushEvent };
}
