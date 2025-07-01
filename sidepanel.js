document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const initText = params.get('text');
    if (initText) {
        document.getElementById('input').value = initText;
        // 自动触发翻译
        document.getElementById('translateBtn').click();
    }
});

document.getElementById('translateBtn').addEventListener('click', () => {
    const textArea = document.getElementById('input');
    const text = textArea.value;
    if (!text.trim()) {
        alert('请输入要翻译的内容');
        return;
    }

    // 获取当前页面标题
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) {
            document.getElementById('result').value = '无法获取当前页面信息';
            return;
        }

        const title = tabs[0].title;
        document.getElementById('result').value = '翻译中...';

        chrome.runtime.sendMessage(
            { action: "translateText", text: text, title: title },
            (response) => {
                if (response?.translatedText) {
                    document.getElementById('result').value = response.translatedText;
                } else {
                    const error = response?.error || '未知错误';
                    document.getElementById('result').value = `错误: ${error}`;
                }
            }
        );
    });
});