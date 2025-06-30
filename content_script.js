// content_script.js

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "translate") {
        console.log("Translation process started...");
        translatePage();
    }
});

// 翻译页面的主函数
async function translatePage() {

    chrome.runtime.sendMessage({ type: "updateStatus", text: "正在翻译..." });

    const settingsKeys = {
        selectors: 'p, h1, h2, h3, h4, h5, h6, li, span, a, blockquote',
        maxConcurrentRequests: 6
    };

    // 使用更健壮的方式获取设置
    chrome.storage.sync.get(settingsKeys, (settings) => {

        // 1. 定义要翻译的 HTML 标签
        console.log(`Translating elements with: ${settings.selectors}`)
        const elements = document.querySelectorAll(settings.selectors);

        // 检查标题是否为空且未被翻译过
        // if (document.title && !document.head.dataset.titleTranslated) {
        //     const originalTitle = document.title;
        //     document.head.dataset.titleTranslated = 'true'; // 添加标记，防止重复翻译
        //     // 发起标题翻译请求
        //     chrome.runtime.sendMessage({ action: "translateText", text: originalTitle }, (response) => {
        //         if (response && response.translatedText) {
        //             document.title = response.translatedText; // 成功后替换标题
        //             console.log(`Title translated to: "${response.translatedText}"`);
        //         } else if (response && response.error) {
        //             console.error(`Title translation failed for: "${originalTitle}". Error: ${response.error}`);
        //         } else {
        //             console.error(`Title translation failed for: "${originalTitle}".`);
        //         }
        //     });
        // }

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
        const maxConcurrentRequests = settings.maxConcurrentRequests;
        console.log('Max concurrent requests:', maxConcurrentRequests);

        let activeRequests = 0;
        let taskIndex = 0;

        const pageTitle = document.title;

        // 4. 实现批量处理逻辑
        // 原理是进入循环，处理任务是非阻塞的。没达到设置的maxConcurrentRequests则继续启动，达到则退出。
        // 每个启动的处理任务结束后都会再次调用这个函数自己。调用的时候会自动根据当前剩余任务量启动对应的个数。
        // 总之在处理完之前，保证同一时刻启动的数目总数（调用processNextBatch的次数）不会超过设定的maxConcurrentRequests个。
        // 调用一次processNextBatch启动的数目可能是0~maxConcurrentRequests个，取决于activeRequests
        function processNextBatch() {
            // 当活动请求少于最大并发数，并且还有任务待处理时，启动新任务
            while (activeRequests < maxConcurrentRequests && taskIndex < tasks.length) {
                const task = tasks[taskIndex];
                taskIndex++;
                activeRequests++;
                chrome.runtime.sendMessage({ type: "updateStatus", text: `正在翻译: ${taskIndex} / ${tasks.length}` });
                console.log(`Translating: ${taskIndex} / ${tasks.length} `)

                // 为每个任务添加一个标记，防止重复翻译
                task.element.dataset.translated = 'true';

                // 发起翻译请求
                chrome.runtime.sendMessage({ action: "translateText", text: task.originalText, title: pageTitle }, (response) => {
                    // const originalColor = window.getComputedStyle(task.node).color;// 保存原始颜色
                    if (response && response.translatedText) {
                        task.node.nodeValue = response.translatedText;
                        // task.node.style.color = originalColor;// 成功后替换文本，并恢复颜色
                    } else if (response && response.error) {
                        // task.node.style.color = "red";// 失败时，设置错误颜色
                        console.error(`Translation failed for: "${task.originalText.substring(0, 50)}...". Error: ${response.error}`);
                    } else {
                        // 失败时，设置错误颜色
                        // task.node.style.color = "darkred";
                        // console.error(`Translation failed for: "${task.originalText.substring(0, 50)}...".`);
                    }

                    // 请求完成
                    activeRequests--;

                    // 这个逻辑可以简化为：每完成一个，就尝试启动一个新的
                    processNextBatch();
                });
            }

            if (taskIndex >= tasks.length && activeRequests === 0) {
                console.log(`All translation tasks finished. totla = ${tasks.length}`);
                chrome.runtime.sendMessage({ type: "updateStatus", text: `翻译完毕。总共 ${tasks.length} 个段落完成。` });
            }
        }

        // 启动第一批任务
        processNextBatch();
    });
}