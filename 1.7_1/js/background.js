const handlers = {
  scraperScrapeTab: function(b, sender, sendResponse) {
    chrome.tabs.sendMessage(parseInt(b.tab, 10), { command: "scraperScrape", payload: b.options }, sendResponse);
    return true; // async
  },
  scraperSpreadsheet: function(b, sender, sendResponse) {
    chrome.identity.getAuthToken({ interactive: true }, function(token) {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        const title = b.title || "";
        const boundary = "scraper-" + Date.now() + "-" + Math.round(1E6 * Math.random());
        const metadata = { title: title };
        
        let body = "--" + boundary + "\n";
        body += "Content-Type: application/json; charset=UTF-8\n\n";
        body += JSON.stringify(metadata) + "\n";
        body += "--" + boundary + "\n";
        body += "Content-Type: text/csv\n\n";
        body += b.csv + "\n";
        body += "--" + boundary + "--\n";

        fetch("https://www.googleapis.com/upload/drive/v2/files?uploadType=multipart&convert=true", {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": 'multipart/related; boundary="' + boundary + '"'
          },
          body: body
        }).then(res => {
          if (res.status === 401) {
            chrome.identity.removeCachedAuthToken({ token: token });
            sendResponse({ error: "Google authentication failed. Please try exporting again, and you will be re-authenticated." });
          } else if (res.ok) {
            res.json().then(data => {
              if (data && data.alternateLink) chrome.tabs.create({ url: data.alternateLink });
              sendResponse(data);
            });
          } else {
            res.text().then(text => sendResponse({ error: "Received an unexpected response.\n\n" + text }));
          }
        }).catch(err => sendResponse({ error: err.toString() }));
      }
    });
    return true;
  }
};

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (typeof request === "object" && "command" in request && "payload" in request) {
    const handler = handlers[request.command];
    if (typeof handler === "function") {
      return handler(request.payload, sender, sendResponse);
    } else {
      console.error("no handler for command: " + request.command);
    }
  }
});

chrome.contextMenus.create({
  title: "Scrape similar...",
  id: "scrapeSimilarItem",
  contexts: ["all"]
});

chrome.contextMenus.onClicked.addListener(function(info, tab) {
  if (info.menuItemId === "scrapeSimilarItem") {
    let handled = false;
    chrome.tabs.sendMessage(tab.id, { command: "scraperSelectionOptions" }, function(res) {
      if (chrome.runtime.lastError) {
        return;
      }
      handled = true;
      let b = res || {};
      chrome.windows.create({
        url: chrome.runtime.getURL("viewer.html") + "?tab=" + tab.id + "&options=" + encodeURIComponent(JSON.stringify(b)),
        type: "popup",
        width: 960,
        height: 400
      });
    });
    setTimeout(function() {
      if (!handled && confirm("You need to reload this page before you can use Scraper. Press ok if you would like to reload it now, or cancel if not.")) {
        chrome.tabs.update(tab.id, { url: "javascript:window.location.reload()" });
      }
    }, 500);
  }
});
