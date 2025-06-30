// popup.js
document.getElementById('translateButton').addEventListener('click', () => {
    // 获取当前活动的标签页
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        // 向 content_script 发送消息，触发翻译流程
        chrome.tabs.sendMessage(tabs[0].id, { action: "translate" });
    });
});