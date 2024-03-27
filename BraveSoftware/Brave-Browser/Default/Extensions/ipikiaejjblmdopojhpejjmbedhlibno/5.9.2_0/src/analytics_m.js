// MIXPANEL
try {
  (function (f, b) {
    if (!b.__SV) {
      var e, g, i, h;
      window.mixpanel = b;
      b._i = [];
      b.init = function (e, f, c) {
        function g(a, d) {
          var b = d.split(".");
          2 == b.length && ((a = a[b[0]]), (d = b[1]));
          a[d] = function () {
            a.push([d].concat(Array.prototype.slice.call(arguments, 0)));
          };
        }
        var a = b;
        "undefined" !== typeof c ? (a = b[c] = []) : (c = "mixpanel");
        a.people = a.people || [];
        a.toString = function (a) {
          var d = "mixpanel";
          "mixpanel" !== c && (d += "." + c);
          a || (d += " (stub)");
          return d;
        };
        a.people.toString = function () {
          return a.toString(1) + ".people (stub)";
        };
        i =
          "disable time_event track track_pageview track_links track_forms track_with_groups add_group set_group remove_group register register_once alias unregister identify name_tag set_config reset opt_in_tracking opt_out_tracking has_opted_in_tracking has_opted_out_tracking clear_opt_in_out_tracking start_batch_senders people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user people.remove".split(
            " "
          );
        for (h = 0; h < i.length; h++) g(a, i[h]);
        var j = "set set_once union unset remove delete".split(" ");
        a.get_group = function () {
          function b(c) {
            d[c] = function () {
              call2_args = arguments;
              call2 = [c].concat(Array.prototype.slice.call(call2_args, 0));
              a.push([e, call2]);
            };
          }
          for (
            var d = {},
              e = ["get_group"].concat(
                Array.prototype.slice.call(arguments, 0)
              ),
              c = 0;
            c < j.length;
            c++
          )
            b(j[c]);
          return d;
        };
        b._i.push([e, f, c]);
      };
      b.__SV = 1.2;
      e = f.createElement("script");
      e.type = "text/javascript";
      e.async = !0;
      e.src =
        "undefined" !== typeof MIXPANEL_CUSTOM_LIB_URL
          ? MIXPANEL_CUSTOM_LIB_URL
          : "/src/mixpanel.min.js";
      g = f.getElementsByTagName("script")[0];
      g.parentNode.insertBefore(e, g);
    }
  })(document, window.mixpanel || []);

  mixpanel.init("7e0461f8d139493735b5591a22a0d617", {
    debug: false,
    api_host: "https://api.mixpanel.com",
  });
  // console.log("MP initialized: ", mixpanel);
} catch (e) {
  console.warn("Error initializing analytics, no events will be sent: ", e);
}

function getUserLicenseFromBackground() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: "getUserLicense",
      },
      function (response) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        }
        resolve(response.licenseKey);
      }
    );
  });
}

async function trackEvent(event, properties) {
  // console.log("MP received call to track event: ", event, properties);
  if (!mixpanel) return;
  const userLicense = await getUserLicenseFromBackground();
  if (userLicense !== null) {
    // identify the user
    mixpanel.identify(userLicense);
    // set user property
    mixpanel.people.set("License Key", userLicense);
    // set the event super property
    mixpanel.register({
      Plan: "pro",
    });
  } else {
    // unset the super property
    mixpanel.register({
      Plan: "free",
    });
  }

  // then track the event
  mixpanel.track(event, properties);
  //   console.log("MP tracked event: ", event, properties);
}
function aliasUser(alias) {
  if (!mixpanel) return;
  mixpanel.alias(alias);
}
function registerEventSuperProperty(properties) {
  if (!mixpanel) return;
  mixpanel.register(properties);
}
function getDistinctId() {
  if (!mixpanel) return;
  return mixpanel.get_distinct_id();
}

if (typeof module === "object") {
  module.exports = { trackEvent };
}
