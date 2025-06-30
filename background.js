// background.js (修订版)

// 监听来自 content_script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "translateText") {

        // 定义我们需要从存储中获取的键和它们的默认值
        const settingsKeys = {
            ollamaUrl: 'http://localhost:11434/api/generate',
            modelName: 'qwen3:14b', // 使用一个常见的模型作为默认值
            temperature: 0.6,
            timeout: 60,
            systemPrompt: 'You are a professional translator. Translate the user\'s text accurately. IMPORTANT: Do not change the HTML structure, such as links or formatting tags (e.g., <a>, <b>, <i>). Do not alter LaTeX code enclosed in \\[...\\] , \\(...\\), $...$ or $$...$$. Only translate the natural language text. Please do NOT output any other content, such as greetings, summaries, or translation points. Only provide translations of the content./nothink',
            userPromptTemplate: '将下面的内容翻译到中文:\n\n{{text}}'
        };

        // 使用更健壮的方式获取设置
        chrome.storage.sync.get(settingsKeys, (settings) => {

            // 检查关键配置是否存在且不为空
            if (!settings.ollamaUrl || !settings.modelName) {
                const errorMessage = "Configuration missing. Please set Ollama URL and Model Name in the options page.";
                console.error(errorMessage);
                sendResponse({ error: errorMessage });
                return; // 提前返回
            }

            // 构建完整的用户 Prompt
            const userPrompt = settings.userPromptTemplate.replace('{{text}}', request.text);

            // 构建请求体
            const body = {
                model: settings.modelName,
                prompt: userPrompt,
                system: settings.systemPrompt,
                stream: false,
                options: {
                    temperature: settings.temperature
                }
            };

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), settings.timeout * 1000);

            fetch(settings.ollamaUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal
            })
                .then(response => {
                    clearTimeout(timeoutId);
                    if (!response.ok) {
                        // 尝试读取错误响应体
                        return response.text().then(text => {
                            throw new Error(`HTTP error! Status: ${response.status}, Body: ${text}`);
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.response) {
                        sendResponse({ translatedText: data.response });
                    } else {
                        throw new Error("Ollama response did not contain a 'response' field.");
                    }
                })
                .catch(error => {
                    clearTimeout(timeoutId);
                    console.error('Error calling Ollama API:', error);
                    sendResponse({ error: error.message });
                });
        });

        return true; // 保持消息通道开放，以进行异步响应
    }
});

// 在插件安装或更新时，可以打印一条日志
chrome.runtime.onInstalled.addListener(() => {
    console.log("Ollama Translator extension installed/updated.");
});