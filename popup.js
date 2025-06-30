// popup.js

// 翻译按钮
document.getElementById('translateButton').addEventListener('click', () => {
    // 获取当前活动的标签页
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        // 向 content_script 发送消息，触发翻译流程
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
