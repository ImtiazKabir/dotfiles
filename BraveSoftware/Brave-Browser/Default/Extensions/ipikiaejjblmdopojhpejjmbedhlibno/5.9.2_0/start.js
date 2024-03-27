let homepageUrl = chrome.runtime.getManifest().homepage_url;

document.addEventListener('DOMContentLoaded', async function () {


	// document.getElementById("go-to-kindle-cloud-button").addEventListener('click', function (event) {
	// 	event.preventDefault();

	// 	chrome.tabs.create({ url: 'pages/kindle_cloud_reader_instructions.html' }, function (tab) {
	// 		pushEvent("start instructions next page", "kindle cloud");
	// 	});
	// });

	// document.getElementById("go-to-pdf-button").addEventListener('click', function (event) {
	// 	event.preventDefault();

	// 	chrome.tabs.create({ url: '/src/pdf.js/web/viewer.html' }, function (tab) {
	// 		pushEvent("start instructions next page", "pdf reader");
	// 	});
	// });

	// document.getElementById("go-to-epub-button").addEventListener('click', function (event) {
	// 	event.preventDefault();

	// 	chrome.tabs.create({ url: 'pages/epub_reader.html' }, function (tab) {
	// 		pushEvent("start instructions next page", "epub reader");
	// 	});
	// });

	// // document.getElementById("go-to-google-docs-button").addEventListener('click', function (event) {
	// // 	event.preventDefault();

	// // 	chrome.tabs.create({ url: 'pages/google_docs_instructions.html' }, function (tab) {
	// // 		pushEvent("start instructions next page", "google docs");
	// // 	});
	// // });

	// document.getElementById("kindle-spreed-pro").addEventListener('click', function (event) {
	// 	event.preventDefault();

	// 	chrome.runtime.sendMessage({ action: "redirectToPaid", featureName: "start_instructions" }, function (response) {

	// 	});
	// });

	// // replace review links with the right one for current browser in manifest
	// $('.a-homepage-url').attr('href', homepageUrl);

	// track first installation
	const backgroundStorage = await initializeBackgroundStorage();
	const toTrackFirstInstall = await backgroundStorage.getSettingFromStorage(backgroundStorage.TO_TRACK_FIRST_INSTALL);
	if (toTrackFirstInstall) {
		trackEvent("Extension Installed");
		await backgroundStorage.setSetting(backgroundStorage.TO_TRACK_FIRST_INSTALL, false);
	}
	// detect if using Chrome
	let isChrome = false;
	if (typeof chrome !== 'undefined') {
		isChrome = true;
	}
	if (!isChrome) {
		// redirect to welcome tutorial
		window.location.href = "https://swiftread.com/i/welcome";
	} else {
		// redirect to welcome tutorial but with the is_chrome query parameter set to true
		window.location.href = "https://swiftread.com/i/welcome?is_chrome=true";
	}

});