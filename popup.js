// popup.js

// 翻译按钮
document.getElementById('translateButton').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: "translate" });
    });
});

// 显示原始文本
document.getElementById('showOriginal').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: "showOriginal" });
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
