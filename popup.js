// popup.js

// 翻译按钮
document.getElementById('translateButton').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: "translate" });
    });
});

// 打开配置按钮
document.getElementById('optionsButton').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

// 监听来自页面的消息，更新那一行字的提示
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === "updateStatus") {
        document.getElementById("translatedStatus").textContent = message.text;
    }
});

// 设置快捷键
document.addEventListener('DOMContentLoaded', function () {
    var shortcutsLink = document.getElementById('go-to-shortcuts');
    shortcutsLink.addEventListener('click', function (event) {
        event.preventDefault();
        let url = 'chrome://extensions/shortcuts';
        if (navigator.userAgent.includes("Edg/")) {
            url = 'edge://extensions/shortcuts';
        }
        chrome.tabs.create({ url: url });
    });
});

// popup打开侧栏的按钮
document.getElementById('openSidebarBtn').addEventListener('click', () => {
    chrome.windows.create({
        url: chrome.runtime.getURL("sidepanel.html"),
        type: "panel",
        width: 600,
        height: 800,
    });
});