// content_script.js
// 有一个内存中的缓存，这样显示原文后不清除翻译结果
// 但是没有磁盘缓存，刷新了或者关闭页面了就得重开了

// 监听来自 popup 的消息

// 翻译
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "translate") {
        console.log("Translation process started...");
        translatePage();
    }
});

// 显示原文
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "showOriginal") {
        console.log("showOriginPage process started...");
        showOriginPage();
    }
});

let showOriginalText = false; // 决定是否显示原始文本
let tasks = []; // 存储的待翻译任务列表
let flag_done = true; // 锁：任务完成标志，避免在建立tasks的时候被打断

// 第一次执行一下，之后有tasks了就刷新重置吧，没必要每次翻译都重建
function createTranslationTasks(elements, translatingColor, tasks) {
    if (tasks.length > 24) { // 如果任务列表超过24个，就清空并重新创建
        return tasks;   // 这么长应该是已经弄过一次了，所以直接返回即可
    }
    const startTime = performance.now(); // 记录开始时间
    console.log("Creating translation tasks...");
    flag_done = false;
    elements.forEach(el => {
        // 使用 el.childNodes 来遍历所有子节点，包括文本节点和元素节点
        Array.from(el.childNodes).forEach(node => {
            // 只处理文本节点，且内容不为空白
            if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== '') {
                node.parentNode.style.oldColor = window.getComputedStyle(node.parentNode).color; // 保存原始颜色以便恢复
                node.parentNode.style.color = translatingColor; // 设置为翻译中文本的颜色
                node.oldNodeValue = node.nodeValue; // 记录原始文本内容
                node.translatedValue = '';  // 翻译后内容
                tasks.push({ element: el, node: node, originalText: node.nodeValue });
            }
        });
    });
    flag_done = true;
    const endTime = performance.now(); // 记录结束时间
    console.log(`Translation tasks created successfully. time: ${endTime - startTime} ms`);
    return tasks;
}


// 翻译页面的主函数
async function translatePage() {

    showOriginalText = false; // 切换模式
    chrome.runtime.sendMessage({ type: "updateStatus", text: "正在翻译..." });

    const settingsKeys = {
        selectors: 'p, h1, h2, h3, h4, h5, h6, li, span, a, blockquote',
        maxConcurrentRequests: 6,
        translatingColor: 'green',
        translateErrorColor: 'red',
    };

    // 使用更健壮的方式获取设置
    chrome.storage.sync.get(settingsKeys, (settings) => {

        // 1. 定义要翻译的 HTML 标签
        console.log(`Translating elements with: ${settings.selectors}`)
        const elements = document.querySelectorAll(settings.selectors);

        // 2.1 创建一个任务队列，我们将所有需要翻译的文本节点和其父元素收集起来
        tasks = createTranslationTasks(elements, settings.translatingColor, tasks);

        // 2.2 检查标题是否存在，翻译标题，标题短，就不缓存了，大不了再翻译一次
        const pageTitle = document.title || '';
        flag_done = false;
        if (document.title !== '') {
            const originalTitle = document.title;
            // 发起标题翻译请求
            chrome.runtime.sendMessage({ action: "translateText", text: originalTitle }, (response) => {
                if (response && response.translatedText) {
                    document.title = response.translatedText; // 成功后替换标题
                    console.log(`Title translated to: "${response.translatedText}"`);
                } else if (response && response.error) {
                    console.error(`Title translation failed for: "${originalTitle}". Error: ${response.error}`);
                } else {
                    console.error(`Title translation failed for: "${originalTitle}".`);
                }
            });
        }
        flag_done = true;

        // 3. 实现滚动请求机制
        const maxConcurrentRequests = settings.maxConcurrentRequests;
        console.log('Max concurrent requests:', maxConcurrentRequests);

        let activeRequests = 0;
        let taskIndex = 0;

        // 4. 实现批量处理逻辑
        // 原理是进入循环，处理任务是非阻塞的。没达到设置的maxConcurrentRequests则继续启动，达到则退出。
        // 每个启动的处理任务结束后都会再次调用这个函数自己。调用的时候会自动根据当前剩余任务量启动对应的个数。
        // 总之在处理完之前，保证同一时刻启动的数目总数（调用processNextBatch的次数）不会超过设定的maxConcurrentRequests个。
        // 调用一次processNextBatch启动的数目可能是0~maxConcurrentRequests个，取决于activeRequests
        function processNextBatch() {
            if (showOriginalText) {
                return; // 这样变量设置为true时，就不会继续翻译了
            }

            // 当活动请求少于最大并发数，并且还有任务待处理时，启动新任务
            while (activeRequests < maxConcurrentRequests && taskIndex < tasks.length) {
                const task = tasks[taskIndex];
                taskIndex++;  // 下一轮用的
                activeRequests++;
                chrome.runtime.sendMessage({ type: "updateStatus", text: `正在翻译: ${taskIndex} / ${tasks.length}` });
                console.log(`Translating: ${taskIndex} / ${tasks.length} `)

                // 发起翻译请求
                if (task.node.translatedValue === '') { // 没翻译则翻译
                    chrome.runtime.sendMessage({ action: "translateText", text: task.originalText, title: pageTitle }, (response) => {
                        if (response && response.translatedText) {
                            task.node.translatedValue = response.translatedText; // 缓存翻译后的文本到内存中
                            task.node.parentNode.style.color = task.node.parentNode.style.oldColor; // 成功后替换文本，并恢复颜色
                            if (!showOriginalText) { // 如果翻译完成后切换为了原文模式，那么就不要替换了，缓存就行了
                                task.node.nodeValue = response.translatedText;
                            }
                        } else if (response && response.error) {
                            task.node.parentNode.style.color = settings.translateErrorColor; // 失败时，设置错误颜色
                            console.error(`Translation failed for: "${task.originalText.substring(0, 50)}...". Error: ${response.error}`);
                        } else {
                            // 失败时，设置错误颜色
                            task.node.parentNode.style.color = settings.translateErrorColor;
                            console.error(`Translation failed for: "${task.originalText.substring(0, 50)}...".`);
                        }

                        activeRequests--;
                        processNextBatch();
                    });
                }
                else { // 如果已经翻译过，直接使用旧值在内存中的的缓存
                    task.node.nodeValue = task.node.translatedValue;
                    task.node.parentNode.style.color = task.node.parentNode.style.oldColor;
                    activeRequests--;
                    // 此处不必继续调用自己，因为火种给异步回调留着就行，这里要么满足循环条件继续了，要么就直接结束循环，输出翻译完毕。
                }
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

// 查看未翻译的原文
async function showOriginPage() {
    let taskIndex = 0;
    showOriginalText = true; // 切换模式
    let cnt = 1;
    while (!flag_done) {
        console.log(`需要等待flag_done锁释放，才能进行。当前等待了 ${cnt} 秒。`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        cnt++;
    }

    const startTime = performance.now(); // 记录开始时间
    while (taskIndex < tasks.length) {
        const task = tasks[taskIndex];
        taskIndex++;
        chrome.runtime.sendMessage({ type: "updateStatus", text: `恢复原文: ${taskIndex} / ${tasks.length}` });
        console.log(`restore origin page: ${taskIndex} / ${tasks.length} `)

        task.node.nodeValue = task.node.oldNodeValue;
        task.node.parentNode.style.color = task.node.parentNode.style.oldColor;
    }
    const endTime = performance.now(); // 记录结束时间
    console.log(`show original text completed. time: ${endTime - startTime} ms`);
}
