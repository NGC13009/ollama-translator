// content_script.js
// 有一个内存中的缓存，这样显示原文后不清除翻译结果
// 但是没有磁盘缓存，刷新了或者关闭页面了就得重开了
// 第一次一定是翻译，第一次不能是显示原文

let showOriginalText = true; // 决定是否显示原始文本
let tasks = []; // 存储的待翻译任务列表
let flag_done = true; // 锁：任务完成标志，避免在建立tasks的时候被打断
let translating_color_style = 'ollama-web-translator-translating-animation';

// clearCache
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "clearCache") {
        tasks = [];
        chrome.runtime.sendMessage({ type: "clearCacheOK" });
    }
});

// 监听来自 popup 的消息切换翻译或者显示原文
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "translate") {
        showOriginalText = !showOriginalText;
        console.log(`showOriginalText: ${showOriginalText} .`);
        if (showOriginalText) {
            showOriginPage();
        } else {
            translatePage();
        }
    }
});

// 片段1：创建翻译任务的函数
function reconstructContent(container, translatedText, preservedNodes) {
    // 1. 清空容器的现有内容
    container.innerHTML = '';

    // 2. 使用正则表达式分割译文，保留占位符作为分隔符的一部分，以便后续处理
    // 正则表达式 /(@\d+#)/ 匹配并捕获占位符
    const parts = translatedText.split(/(@\d+#)/);

    let nodeIndex = 0;
    parts.forEach(part => {
        if (/^@\d+#$/.test(part.trim())) {
            // 3. 如果部分是占位符，从 preservedNodes 数组中取出对应的原始节点并附加
            // part.trim() 是为了去除可能存在的前后空格，例如 " @1# " -> "@1#"
            const placeholderNum = parseInt(part.trim().match(/@(\d+)#/)[1], 10);
            const preservedNode = preservedNodes[placeholderNum - 1];
            if (preservedNode) {
                container.appendChild(preservedNode);
            }
        } else if (part) {
            // 4. 如果部分是普通文本，创建文本节点并附加
            container.appendChild(document.createTextNode(part));
        }
    });
}

// =================================================================================
// createTranslationTasks
// =================================================================================
/**
 * 从一个元素列表中创建翻译任务，并智能地处理嵌套元素。
 * @param {NodeListOf<Element>} elements - 由 `document.querySelectorAll(selectors)` 生成的候选元素列表。
 * @param {Array} tasks - 用于存储已创建任务的数组。
 * @param {number} textMinLen - 创建任务所需的最小文本长度。
 * @returns {Array} - 更新后的任务数组。
 */
function createTranslationTasks(elements, tasks, textMinLen) {
    if (tasks.length > 6) {
        console.log("已经处理过，复用之前的tasks。");
        return tasks;
    }

    const startTime = performance.now();
    console.log("正在从匹配选择器的元素中创建翻译任务...");
    flag_done = false;

    // 使用 Set 来跟踪已经被包含在某个父任务中的元素，以避免嵌套翻译。
    const processedElements = new Set();
    const taskList = []; // 临时存储任务，最后一次性推入全局 tasks

    // 遍历所有由 selectors 匹配到的候选元素
    Array.from(elements).forEach(el => {
        // 关键检查：如果这个元素已经被一个更外层的任务处理过，就跳过。
        if (processedElements.has(el)) {
            return;
        }

        // 优化：快速检查整个元素（包括所有子孙）的文本内容是否足够长。
        // 这可以提前过滤掉很多不包含有效文本的容器元素。
        if (el.textContent.trim().length < textMinLen) {
            return;
        }

        let textParts = [];
        let preservedNodes = [];
        let placeholderIndex = 1;

        const originalChildNodes = Array.from(el.childNodes);

        originalChildNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                textParts.push(node.nodeValue);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const placeholder = ` @${placeholderIndex++}# `;
                textParts.push(placeholder);
                preservedNodes.push(node);
            }
        });

        const combinedText = textParts.join('');

        // 确保组合后的文本不为空（这在 el.textContent 检查后通常都为真，但作为保险）
        if (combinedText.trim().length > 0) {
            el.classList.add(translating_color_style);

            taskList.push({
                element: el,
                originalText: combinedText,
                preservedNodes: preservedNodes,
                originalChildNodes: originalChildNodes,
                translatedText: '',
            });

            // *** 核心逻辑 ***
            // 任务创建成功后，将当前元素及其所有后代元素都标记为“已处理”。
            // 这样，在后续的循环中，如果遇到这些后代元素（即使它们也匹配 selectors），
            // 它们也会因为在 processedElements 中而被跳过。
            processedElements.add(el);
            const descendants = el.querySelectorAll('*');
            descendants.forEach(descendant => processedElements.add(descendant));
        }
    });

    tasks.push(...taskList); // 将所有有效任务一次性添加到全局 tasks 数组
    flag_done = true;
    const endTime = performance.now();
    console.log(`Translation tasks created successfully. Found ${tasks.length} tasks from ${elements.length} candidates. Time: ${endTime - startTime} ms`);

    return tasks;
}

// =================================================================================
// 在 translatePage 函数中的调用方式（保持不变，且是正确的）
// =================================================================================
async function translatePage() {
    // ... (其他代码)

    chrome.storage.sync.get(settingsKeys, (settings) => {

        // 1. 定义并使用 selectors 获取候选元素列表
        console.log(`Translating elements with: ${settings.selectors}`)
        const elements = document.querySelectorAll(settings.selectors); // <--- selectors 在这里发挥作用
        translating_color_style = settings.translating_color_style;
        const textMinLen = settings.textMinLen;

        // 2. 创建任务队列，传入经过 selectors 筛选的列表
        tasks = createTranslationTasks(elements, tasks, textMinLen); // <--- 这里的调用是正确的

        // ... (后续代码)
    });
}




// 翻译页面的主函数
async function translatePage() {

    showOriginalText = false; // 切换模式
    chrome.runtime.sendMessage({ type: "updateStatus", text: "正在翻译..." });

    const settingsKeys = {
        selectors: 'p, h1, h2, h3, h4, h5, h6, li, span, a, blockquote',
        maxConcurrentRequests: 6,
        translateErrorColor: 'red',
        translating_color_style: 'ollama-web-translator-translating-animation',
        textMinLen: 5,
    };

    // 使用更健壮的方式获取设置
    chrome.storage.sync.get(settingsKeys, (settings) => {

        // 1. 定义要翻译的 HTML 标签
        console.log(`Translating elements with: ${settings.selectors}`)
        const elements = document.querySelectorAll(settings.selectors);
        translating_color_style = settings.translating_color_style;
        const textMinLen = settings.textMinLen;

        // 2.1 创建一个任务队列，我们将所有需要翻译的文本节点和其父元素收集起来
        tasks = createTranslationTasks(elements, tasks, textMinLen, settings.selectors);

        // 2.2 检查标题是否存在，翻译标题，标题短，就不缓存了，大不了再翻译一次
        const pageTitle = document.title || '';
        flag_done = false;
        if (document.title.trim().length >= textMinLen) {
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

                // MODIFIED: 适配新的任务结构
                if (task.translatedText === '') { // 如果没有缓存的译文
                    chrome.runtime.sendMessage({ action: "translateText", text: task.originalText, title: pageTitle }, (response) => {
                        if (response && response.translatedText) {
                            task.translatedText = response.translatedText; // 缓存带占位符的译文
                            task.element.classList.remove(translating_color_style);
                            if (!showOriginalText) {
                                // 使用新函数重建内容
                                reconstructContent(task.element, task.translatedText, task.preservedNodes);
                            }
                        } else if (response && response.error) {
                            task.element.style.color = settings.translateErrorColor; // 作用于整个父元素
                            task.element.classList.remove(translating_color_style);
                            console.error(`Translation failed for: "${task.originalText.substring(0, 50)}...". Error: ${response.error}`);
                        } else {
                            task.element.style.color = settings.translateErrorColor;
                            task.element.classList.remove(translating_color_style);
                            console.error(`Translation failed for: "${task.originalText.substring(0, 50)}...".`);
                        }

                        activeRequests--;
                        processNextBatch();
                    });
                } else { // 如果已经翻译过，直接使用缓存重建内容
                    task.element.classList.remove(translating_color_style);
                    if (!showOriginalText) {
                        reconstructContent(task.element, task.translatedText, task.preservedNodes);
                    }
                    activeRequests--;
                    // 此处不必继续调用自己，因为火种给异步回调留着就行，这里要么满足循环条件继续了，要么就直接结束循环，输出翻译完毕。
                }
            }

            if (taskIndex >= tasks.length && activeRequests === 0) {
                console.log(`All translation tasks finished. total = ${tasks.length}`);
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

        // MODIFIED: 恢复整个元素的内容
        task.element.classList.remove(translating_color_style);
        task.element.style.color = ''; // 恢复可能被设置为出错红色的颜色

        // 清空当前内容并用保存的原始子节点列表恢复
        task.element.innerHTML = '';
        task.originalChildNodes.forEach(childNode => {
            task.element.appendChild(childNode);
        });
    }
    const endTime = performance.now(); // 记录结束时间
    console.log(`show original text completed. time: ${endTime - startTime} ms`);
}
