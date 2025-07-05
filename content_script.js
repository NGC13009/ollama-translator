// clearCache



chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "clearCache") {
        // TODO
        chrome.runtime.sendMessage({ type: "clearCacheOK" });
    }
});


// 使用一个立即执行函数表达式 (IIFE) 来避免污染全局作用域
(function () {
    // 防止脚本被重复注入
    if (window.translationManager) {
        return;
    }

    /**
     * @class TranslationManager
     * @description 管理整个页面的翻译状态、任务、缓存和UI更新的核心对象
     */
    const TranslationManager = {
        // --- 默认设置 ---
        settings: {
            selectors: 'p, h1, h2, h3, h4, h5, h6, li, span, a, blockquote',
            maxConcurrentRequests: 6,
            translateErrorColor: 'red',
            translating_color_style: 'ollama-web-translator-translating-animation',
            minTranslatingLen: 5,
            translateHTMLMaxLength: 15,
        },

        // --- 内部状态 ---
        state: 'IDLE', // 'IDLE', 'BUILDING', 'TRANSLATING', 'TRANSLATED', 'RESTORING'
        tasks: [], // 存储所有待处理的翻译任务对象
        requestQueue: [], // 待处理任务的索引队列
        activeRequests: 0, // 当前正在进行的API请求数
        isInterrupted: false, // 翻译过程是否被中断的标志

        /**
         * 初始化管理器，加载用户设置
         */
        init() {
            chrome.storage.sync.get(this.settings, (userSettings) => {
                // 合并用户设置和默认设置
                this.settings = { ...this.settings, ...userSettings };
                console.log('翻译管理器已初始化，使用设置:', this.settings);
            });
        },

        /**
         * 公共接口：开始翻译整个页面
         */
        async translatePage() {
            if (this.state === 'TRANSLATING' || this.state === 'TRANSLATED') {
                console.log('页面已经或正在翻译中，操作取消。');
                return;
            }

            console.log('开始翻译页面...');
            this.state = 'TRANSLATING';
            this.isInterrupted = false;

            // 1. 如果任务列表为空，则构建它（只执行一次）
            if (this.tasks.length === 0) {
                this._buildTasks();
            }

            // 2. 准备翻译队列
            this.requestQueue = [];
            for (let i = 0; i < this.tasks.length; i++) {
                const task = this.tasks[i];

                // 如果已有缓存，直接使用缓存恢复翻译状态
                if (task.translatedHTML) {
                    task.element.innerHTML = task.translatedHTML;
                    task.status = 'DONE';
                } else {
                    task.status = 'PENDING';
                    // 给待翻译的元素添加视觉效果
                    task.element.classList.add(this.settings.translating_color_style);
                    this.requestQueue.push(i);
                }
            }

            // 3. 启动并发请求处理器
            this._processQueue();
        },

        /**
         * 公共接口：恢复页面到原始状态
         */
        restoreOriginal() {
            if (this.state === 'IDLE') {
                console.log('页面已经是原始状态，操作取消。');
                return;
            }
            console.log('正在恢复原始页面...');
            this.state = 'RESTORING';
            this.isInterrupted = true; // 设置中断标志，停止新的翻译请求

            this.tasks.forEach(task => {
                if (task.originalHTML) {
                    task.element.innerHTML = task.originalHTML;
                }
                // 移除所有可能添加的样式
                task.element.classList.remove(this.settings.translating_color_style);
                if (task.element.style.color === this.settings.translateErrorColor) {
                    task.element.style.color = '';
                }
            });

            // 重置状态，以便可以再次翻译
            this.state = 'IDLE';
            console.log('页面已恢复。');
        },

        // --- 私有方法 ---

        /**
         * 扫描DOM并构建翻译任务列表。这个过程只应执行一次。
         * @private
         */
        _buildTasks() {
            this.state = 'BUILDING';
            console.log('正在构建翻译任务列表...');
            const elements = document.querySelectorAll(this.settings.selectors);
            const pageTitle = document.title; // 获取页面标题，用于传递给API

            elements.forEach((element, index) => {
                // 过滤掉不可见、内容过短或已经被包含在父任务中的元素
                if (element.offsetParent === null ||
                    element.innerText.trim().length < this.settings.minTranslatingLen ||
                    element.closest('[data-translation-task-id]')) {
                    return;
                }

                const originalHTML = element.innerHTML;
                const task = {
                    id: index,
                    element: element,
                    pageTitle: pageTitle,
                    originalHTML: originalHTML,
                    translatedHTML: null, // 用于缓存翻译结果
                    status: 'IDLE', // 'IDLE', 'PENDING', 'IN_FLIGHT', 'DONE', 'ERROR'
                    isSimple: originalHTML.length < this.settings.translateHTMLMaxLength,
                    serializedText: null,
                    placeholderMap: new Map(),
                };

                // 根据策略序列化文本
                if (task.isSimple) {
                    // 简单模式：直接将整个HTML作为待翻译文本
                    task.serializedText = originalHTML;
                } else {
                    // 复杂模式：使用占位符策略
                    task.serializedText = this._serializeNode(element, task.placeholderMap);
                }

                // 如果序列化后没有有效文本，则跳过
                if (!task.serializedText.trim()) return;

                // 给元素添加一个标记，避免其子元素被重复创建为任务
                element.setAttribute('data-translation-task-id', index);
                this.tasks.push(task);
            });
            console.log(`任务列表构建完成，共找到 ${this.tasks.length} 个可翻译的块。`);
        },

        /**
         * 核心并发控制器：按顺序处理队列，并确保并发数不超过上限
         * @private
         */
        _processQueue() {
            while (this.activeRequests < this.settings.maxConcurrentRequests && this.requestQueue.length > 0) {
                if (this.isInterrupted) {
                    console.log('翻译过程已被中断。');
                    // 清理剩余队列元素的样式
                    this.requestQueue.forEach(taskIndex => {
                        this.tasks[taskIndex].element.classList.remove(this.settings.translating_color_style);
                    });
                    this.requestQueue = [];
                    return;
                }

                const taskIndex = this.requestQueue.shift();
                const task = this.tasks[taskIndex];

                if (task.status !== 'PENDING') continue;

                this.activeRequests++;
                task.status = 'IN_FLIGHT';

                this._performTranslation(task);
            }

            // 检查是否所有任务都已完成
            if (this.requestQueue.length === 0 && this.activeRequests === 0 && !this.isInterrupted) {
                this.state = 'TRANSLATED';
                console.log('所有翻译任务完成！');
            }
        },

        /**
         * 执行单个翻译任务（API调用）
         * @param {object} task - 任务对象
         * @private
         */
        _performTranslation(task) {
            chrome.runtime.sendMessage({
                action: "translateText",
                text: task.serializedText,
                title: task.pageTitle // 将页面标题传给后台
            }, (response) => {
                // chrome.runtime.lastError 可能在 background service worker 失活时出现
                if (chrome.runtime.lastError) {
                    console.error('翻译API通信错误:', chrome.runtime.lastError.message, '对于任务:', task);
                    this._handleTranslationResult(task, { error: true, message: chrome.runtime.lastError.message });
                    return;
                }
                this._handleTranslationResult(task, response);
            });
        },

        /**
         * 处理从 background 返回的翻译结果
         * @param {object} task - 任务对象
         * @param {object} response - API响应
         * @private
         */
        _handleTranslationResult(task, response) {
            // 首先，减少活跃请求计数
            this.activeRequests--;

            // 如果在等待响应期间用户点击了恢复，则不做任何DOM修改
            if (this.isInterrupted) {
                this._processQueue(); // 尝试处理下一个，但很可能会因为中断标志而立即退出
                return;
            }

            // 移除“正在翻译”的样式
            task.element.classList.remove(this.settings.translating_color_style);

            if (response && response.translatedText) {
                // 成功
                task.status = 'DONE';
                task.translatedHTML = response.translatedText; // 缓存结果

                if (task.isSimple) {
                    task.element.innerHTML = task.translatedHTML;
                } else {
                    this._deserializeNode(task.element, task.translatedHTML, task.placeholderMap);
                }

            } else {
                // 失败
                task.status = 'ERROR';
                task.element.style.color = this.settings.translateErrorColor; // 设置错误颜色
                console.error('翻译失败:', response.message || '未知错误', '对于任务:', task);
            }

            // 关键：无论成功失败，都尝试启动下一个队列中的任务
            this._processQueue();
        },

        /**
         * 序列化DOM节点为字符串（复杂模式）
         * @private
         */
        _serializeNode(rootNode, nodeMap, atomicTags = ['math', 'img', 'video', 'button', 'input', 'textarea', 'svg', 'canvas', 'code', 'pre']) {
            let result = '';
            const childNodes = Array.from(rootNode.childNodes);

            for (const node of childNodes) {
                if (node.nodeType === Node.TEXT_NODE) {
                    result += node.nodeValue;
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    const tagName = node.tagName.toLowerCase();
                    if (atomicTags.includes(tagName) || node.hasAttribute('data-no-translate')) {
                        const placeholderId = `@${nodeMap.size + 1}#`;
                        nodeMap.set(placeholderId, node.cloneNode(true));
                        result += placeholderId;
                    } else {
                        // 保留标签和属性
                        const attributes = Array.from(node.attributes).map(attr => `${attr.name}="${attr.value}"`).join(' ');
                        result += `<${tagName} ${attributes}>`;
                        result += this._serializeNode(node, nodeMap, atomicTags);
                        result += `</${tagName}>`;
                    }
                }
            }
            return result;
        },

        /**
         * 反序列化字符串到DOM节点（复杂模式）
         * @private
         */
        _deserializeNode(targetNode, translatedString, nodeMap) {
            targetNode.innerHTML = '';
            const placeholderRegex = /(@\d+#)/g;
            const parts = translatedString.split(placeholderRegex).filter(Boolean);

            for (const part of parts) {
                if (nodeMap.has(part)) {
                    targetNode.appendChild(nodeMap.get(part));
                } else {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = part;
                    while (tempDiv.firstChild) {
                        targetNode.appendChild(tempDiv.firstChild);
                    }
                }
            }
        },
    };

    // --- 启动与监听 ---

    // 1. 初始化管理器
    TranslationManager.init();

    // 2. 监听来自 popup 的消息切换翻译或者显示原文
    let showOriginalText = true;   // 状态切换
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "translate") {
            showOriginalText = !showOriginalText;
            console.log(`showOriginalText: ${showOriginalText} .`);
            if (showOriginalText) {
                TranslationManager.restoreOriginal();
            } else {
                TranslationManager.translatePage();
            }
        }
        return true;
    });

    // 3. 将管理器暴露到 window 对象，方便调试
    window.translationManager = TranslationManager;

})();