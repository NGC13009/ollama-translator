// content_script.js

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "translate") {
        console.log("Translation process started...");
        translatePage();
    }
});

async function translatePage() {
    // 1. 定义要翻译的 HTML 标签
    const selectors = 'p, h1, h2, h3, h4, h5, h6, li, span, a, blockquote';
    const elements = document.querySelectorAll(selectors);

    // 2. 创建一个任务队列
    // 我们将所有需要翻译的文本节点和其父元素收集起来
    const tasks = [];
    elements.forEach(el => {
        // 使用 el.childNodes 来遍历所有子节点，包括文本节点和元素节点
        Array.from(el.childNodes).forEach(node => {
            // 只处理文本节点，且内容不为空白
            if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== '') {
                // 检查父元素和节点自身是否已经被标记为已翻译
                if (el.dataset.translated === 'true' || node.parentElement.dataset.translated === 'true') {
                    return;
                }
                tasks.push({ element: el, node: node, originalText: node.nodeValue });
            }
        });
    });

    // 3. 实现滚动请求机制
    const maxConcurrentRequests = 16; // 最多同时发送 m=16 个请求
    const batchSize = 8; // 每次处理完 k=8 个后，再发送下一批

    let activeRequests = 0;
    let taskIndex = 0;

    function processNextBatch() {
        // 当活动请求少于最大并发数，并且还有任务待处理时，启动新任务
        while (activeRequests < maxConcurrentRequests && taskIndex < tasks.length) {
            const task = tasks[taskIndex];
            taskIndex++;

            activeRequests++;

            // 为每个任务添加一个标记，防止重复翻译
            task.element.dataset.translated = 'true';

            // 发起翻译请求
            chrome.runtime.sendMessage({ action: "translateText", text: task.originalText }, (response) => {
                if (response && response.translatedText) {
                    // 成功后替换文本
                    task.node.nodeValue = response.translatedText;
                } else if (response && response.error) {
                    // 失败了，可以考虑把原文恢复或者标记为失败
                    console.error(`Translation failed for: "${task.originalText.substring(0, 50)}...". Error: ${response.error}`);
                    task.element.style.border = "1px solid red"; // 视觉上标记失败
                }

                // 请求完成
                activeRequests--;

                // 当完成的请求达到一定数量 (batchSize)，或者所有任务都已启动时，尝试处理下一批
                // 这个逻辑可以简化为：每完成一个，就尝试启动一个新的
                processNextBatch();
            });
        }

        if (taskIndex >= tasks.length && activeRequests === 0) {
            console.log("All translation tasks finished.");
        }
    }

    // 启动第一批任务
    processNextBatch();
}