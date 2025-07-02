// options.js

// 设置快捷键
document.addEventListener('DOMContentLoaded', function () {
    var shortcutsLink = document.getElementById('go-to-shortcuts');
    shortcutsLink.addEventListener('click', function (event) {
        event.preventDefault();
        let url = 'chrome://extensions/shortcuts';
        if (navigator.userAgent.includes("Edg/")) {
            url = 'edge://extensions/shortcuts';
        }
        chrome.tabs.create({ url: url });
    });
});

// 保存设置
function saveOptions() {
    const status = document.getElementById('status');
    // 从表单获取值
    const ollamaUrl = document.getElementById('ollamaUrl').value;
    const modelName = document.getElementById('modelName').value;
    const temperature = parseFloat(document.getElementById('temperature').value);
    const timeout = parseInt(document.getElementById('timeout').value);
    const systemPrompt = document.getElementById('systemPrompt').value;
    const userPromptTemplate = document.getElementById('userPromptTemplate').value;
    const maxConcurrentRequests = parseInt(document.getElementById('maxConcurrentRequests').value);
    const minTranslatingLen = parseInt(document.getElementById('minTranslatingLen').value);
    const selectors = document.getElementById('selectors').value || 'p, h1, h2, h3, h4, h5, h6, li, span, a, blockquote';
    const apikey = document.getElementById('apikey').value || 'null';
    const translateErrorColor = document.getElementById('translateErrorColor').value || '#aa0000';
    const translating_color_style = document.getElementById("translateAnimation").value || 'ollama-web-translator-translating-animation';

    try {
        // 检查 URL 是否合法
        if (!new URL(ollamaUrl)) {
            status.textContent = '错误：ollamaUrl 不合法';
            status.style.color = '#aa0000';
            alert('错误：URL 不合法');
            return;
        }

        // 检查 userPromptTemplate 是否包含 "{{{text}}}"
        if (!userPromptTemplate.includes("{{{text}}}")) {
            status.textContent = '错误：用户提示模板必须包含 "{{{text}}}"';
            status.style.color = '#aa0000';
            alert('错误：用户提示模板必须包含 "{{{text}}}"');
            return;
        }

        // 检查 systemPrompt 是否包含 "{{{text}}}"
        if (systemPrompt.includes("{{{text}}}")) {
            status.textContent = '错误：系统提示模板必须不能包含 "{{{text}}}"，包含此模板是错误的，这个模板应该只能出现在用户提示词模板内。';
            status.style.color = '#aa0000';
            alert('错误：系统提示模板必须不能包含 "{{{text}}}"，包含此模板是错误的，这个模板应该只能出现在用户提示词模板内。');
            return;
        }

        // 检查 maxConcurrentRequests 是否 > 0
        if (maxConcurrentRequests <= 0) {
            status.textContent = '错误：最大并发请求数必须是大于 0 的整数';
            status.style.color = '#aa0000';
            alert('错误：最大并发请求数必须是大于 0 的整数');
            return;
        }
        // 检查 minTranslatingLen 是否 > 0
        if (minTranslatingLen <= 0) {
            status.textContent = '错误：最小翻译长度必须是大于 0 的整数';
            status.style.color = '#aa0000';
            alert('错误：最小翻译长度必须是大于 0 的整数');
            return;
        }

        // 检查 temperature 是否 >= 0
        if (temperature < 0) {
            status.textContent = '错误：大模型采样温度系数必须是大于等于 0 的数字';
            status.style.color = '#aa0000';
            alert('错误：temperature 必须是大于等于 0 的数字');
            return;
        }

        // 检查 timeout 是否 > 0
        if (timeout <= 0) {
            status.textContent = '错误：超时时间必须是大于 0 的整数';
            status.style.color = '#aa0000';
            alert('错误：timeout 必须是大于 0 的整数');
            return;
        }

        // 通过验证
    } catch (e) {
        status.textContent = '错误：验证过程中发生错误，表单存在错误的值，无法使能配置清单。请检查表单中的值并修复问题。';
        status.style.color = '#aa0000';
        alert('错误：验证过程中发生错误，表单存在错误的值，无法使能配置清单。请检查表单中的值并修复问题。');
        return;
    }

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
        apikey,
        translateErrorColor,
        translating_color_style,
        minTranslatingLen,
    }, () => {
        // 保存成功后，向用户显示一个提示
        status.textContent = `配置成功，配置清单已启用并保存。${new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
        status.style.color = '#00aa00';
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
        systemPrompt: 'You are a professional translator. Translate the user\'s text accurately. 当前内容是页面标题为如下内容的文本：\n\n```\n{{{title}}}\n```\n\n这个标题可能有助于翻译质量，但是请勿将标题信息翻译直接附加到输出中。IMPORTANT: Do not change the HTML structure, such as links or formatting tags (e.g., <a>, <b>, <i>). Do not alter LaTeX code enclosed in \\[...\\] , \\(...\\), $...$ or $$...$$. Only translate the natural language text. Please do NOT output any other content, such as greetings, summaries, or translation points. Only provide translations of the content. 你看见的内容不一定是全貌，可能是上下文中的一个节选短句，请自动根据主题确定翻译结果，以尽可能与未看见的上下文匹配。 /nothink',
        userPromptTemplate: '将下面内容翻译到中文:\n\n{{{text}}}',
        maxConcurrentRequests: 6,
        selectors: 'p, h1, h2, h3, h4, h5, h6, li, span, a, blockquote',
        apikey: 'null',
        translateErrorColor: 'red',
        translating_color_style: 'ollama-web-translator-translating-animation',
        minTranslatingLen: 5,
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
        document.getElementById('minTranslatingLen').value = items.minTranslatingLen;
        document.getElementById('selectors').value = items.selectors;
        document.getElementById('apikey').value = items.apikey;
        document.getElementById('translateErrorColor').value = items.translateErrorColor;
        document.getElementById("translateAnimation").value = items.translating_color_style;
    });
}

// 页面加载时加载设置
document.addEventListener('DOMContentLoaded', restoreOptions);
// 点击保存按钮时保存设置
document.getElementById('save').addEventListener('click', saveOptions);
