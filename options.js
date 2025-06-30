// options.js

// 保存设置
function saveOptions() {
    // 从表单获取值
    const ollamaUrl = document.getElementById('ollamaUrl').value;
    const modelName = document.getElementById('modelName').value;
    const temperature = parseFloat(document.getElementById('temperature').value);
    const timeout = parseInt(document.getElementById('timeout').value, 10);
    const systemPrompt = document.getElementById('systemPrompt').value;
    const userPromptTemplate = document.getElementById('userPromptTemplate').value;
    const maxConcurrentRequests = parseInt(document.getElementById('maxConcurrentRequests').value, 6);
    const selectors = document.getElementById('selectors').value || 'p, h1, h2, h3, h4, h5, h6, li, span, a, blockquote';
    const apikey = document.getElementById('apikey').value || 'null';

    // 使用 chrome.storage.sync API 保存数据
    // sync 会通过谷歌账户同步，local 只保存在本地
    chrome.storage.sync.set({
        ollamaUrl,
        modelName,
        temperature,
        timeout,
        systemPrompt,
        userPromptTemplate,
        maxConcurrentRequests,
        selectors,
        apikey
    }, () => {
        // 保存成功后，向用户显示一个提示
        const status = document.getElementById('status');
        status.textContent = 'Options saved.';
        setTimeout(() => {
            status.textContent = '';
        }, 1500);
    });
}

// 加载已保存的设置
function restoreOptions() {
    // 设置默认值
    const defaults = {
        ollamaUrl: 'http://localhost:11434/api/generate',
        modelName: 'qwen3:14b', // 使用一个常见的模型作为默认值
        temperature: 0.6,
        timeout: 60,
        systemPrompt: 'You are a professional translator. Translate the user\'s text accurately. 当前内容是页面标题为 {{{title}}} 内的文本。IMPORTANT: Do not change the HTML structure, such as links or formatting tags (e.g., <a>, <b>, <i>). Do not alter LaTeX code enclosed in \\[...\\] , \\(...\\), $...$ or $$...$$. Only translate the natural language text. Please do NOT output any other content, such as greetings, summaries, or translation points. Only provide translations of the content. /nothink',
        userPromptTemplate: '将下面内容翻译到中文:\n\n{{{text}}}',
        maxConcurrentRequests: 6,
        selectors: 'p, h1, h2, h3, h4, h5, h6, li, span, a, blockquote',
        apikey: 'null',
    };

    chrome.storage.sync.get(defaults, (items) => {
        // 将加载的设置填充到表单中
        document.getElementById('ollamaUrl').value = items.ollamaUrl;
        document.getElementById('modelName').value = items.modelName;
        document.getElementById('temperature').value = items.temperature;
        document.getElementById('timeout').value = items.timeout;
        document.getElementById('systemPrompt').value = items.systemPrompt;
        document.getElementById('userPromptTemplate').value = items.userPromptTemplate;
        document.getElementById('maxConcurrentRequests').value = items.maxConcurrentRequests;
        document.getElementById('selectors').value = items.selectors;
        document.getElementById('apikey').value = items.apikey;
    });
}

// 页面加载时加载设置
document.addEventListener('DOMContentLoaded', restoreOptions);
// 点击保存按钮时保存设置
document.getElementById('save').addEventListener('click', saveOptions);
