
// 右键菜单直接翻译
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const initText = params.get('text');
    if (initText) {
        document.getElementById('input').value = initText;
        document.getElementById('translateBtn').click(); // 模拟按一次翻译按钮
    }
});

// 手动输入按按钮翻译
document.getElementById('translateBtn').addEventListener('click', () => {
    const button = document.getElementById('translateBtn');
    button.disabled = true;
    button.textContent = '翻译中...';
    button.classList.add('disabled-btn');
    const textArea = document.getElementById('input');
    const text = textArea.value;
    if (!text.trim()) {
        button.textContent = '空内容！';
        setTimeout(() => {
            document.getElementById('result').value = '';
            button.disabled = false;
            button.classList.remove('disabled-btn');
            button.textContent = '翻译';
        }, 1000);
        return;
    }

    // 获取当前页面标题
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const title = tabs[0].title || '当前页面没有标题';
        document.getElementById('result').value = '翻译中...请耐心等待翻译结果，翻译好之后再复制内容或查看。';

        document.getElementById('copytoclipboard').disabled = true;
        document.getElementById('clearBtn').disabled = true;
        document.getElementById('copyandclose').disabled = true;
        document.getElementById('copytoclipboard').classList.add('disabled-btn');
        document.getElementById('clearBtn').classList.add('disabled-btn');
        document.getElementById('copyandclose').classList.add('disabled-btn');

        chrome.runtime.sendMessage(
            { action: "translateText", text: text, title: title },
            (response) => {
                button.disabled = false;
                button.textContent = '翻译';
                document.getElementById('copytoclipboard').disabled = false;
                document.getElementById('clearBtn').disabled = false;
                document.getElementById('copyandclose').disabled = false;

                button.classList.remove('disabled-btn');
                document.getElementById('copytoclipboard').classList.remove('disabled-btn');
                document.getElementById('clearBtn').classList.remove('disabled-btn');
                document.getElementById('copyandclose').classList.remove('disabled-btn');

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

// 复制到剪贴板
document.getElementById('copytoclipboard').addEventListener('click', () => {
    const resultText = document.getElementById('result').value;
    navigator.clipboard.writeText(resultText).then(() => {
        const button = document.getElementById('copytoclipboard');
        button.textContent = '复制成功！';
        button.classList.add('copied-success');
        setTimeout(() => {
            button.textContent = '复制到剪贴板';
            button.classList.remove('copied-success');
        }, 1500);
    }).catch(err => {
        alert(`内容复制到剪贴板: 错误: ${err.message}`);
    });
});


// 复制到剪贴板并关闭
document.getElementById('copyandclose').addEventListener('click', () => {
    const resultText = document.getElementById('result').value;
    navigator.clipboard.writeText(resultText).then(() => {
        setTimeout(() => {
            window.close();
        }, 300);

    }).catch(err => {
        alert(`内容复制到剪贴板: 错误: ${err.message}`);
    });
});

// 清空内容
document.getElementById('clearBtn').addEventListener('click', () => {
    const button = document.getElementById('clearBtn');
    document.getElementById('result').value = '';
    document.getElementById('input').value = '';
    button.textContent = '清空成功！';
    button.classList.add('qingkong-success');
    setTimeout(() => {
        button.textContent = '清空';
        button.classList.remove('qingkong-success');
    }, 1500);
});