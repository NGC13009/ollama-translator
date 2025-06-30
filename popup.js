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

// 快捷键
chrome.commands.onCommand.addListener((command) => {
    if (command === "toggle-translation") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: "translate" });
        });
    }
});

// 监听来自页面的消息，更新那一行字的提示
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === "updateStatus") {
        document.getElementById("translatedStatus").textContent = message.text;
    }
});
