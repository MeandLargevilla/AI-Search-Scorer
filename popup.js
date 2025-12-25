document.addEventListener('DOMContentLoaded', () => {
    const providerSelect = document.getElementById('provider');
    const geminiConfig = document.getElementById('geminiConfig');
    const openaiConfig = document.getElementById('openaiConfig');
    
    // 切换显示
    providerSelect.addEventListener('change', () => {
        if (providerSelect.value === 'gemini') {
            geminiConfig.style.display = 'block';
            openaiConfig.style.display = 'none';
        } else {
            geminiConfig.style.display = 'none';
            openaiConfig.style.display = 'block';
        }
    });

    // 加载数据
    chrome.storage.local.get(['provider', 'geminiKey', 'openaiKey', 'openaiUrl', 'openaiModel'], (res) => {
        if(res.provider) {
            providerSelect.value = res.provider;
            providerSelect.dispatchEvent(new Event('change')); // 触发切换UI
        }
        if(res.geminiKey) document.getElementById('geminiKey').value = res.geminiKey;
        if(res.openaiKey) document.getElementById('openaiKey').value = res.openaiKey;
        if(res.openaiUrl) document.getElementById('openaiUrl').value = res.openaiUrl;
        if(res.openaiModel) document.getElementById('openaiModel').value = res.openaiModel;
    });

    // 保存
    document.getElementById('saveBtn').addEventListener('click', () => {
        const config = {
            provider: providerSelect.value,
            geminiKey: document.getElementById('geminiKey').value.trim(),
            openaiKey: document.getElementById('openaiKey').value.trim(),
            openaiUrl: document.getElementById('openaiUrl').value.trim(),
            openaiModel: document.getElementById('openaiModel').value.trim()
        };
        
        chrome.storage.local.set(config, () => {
            const status = document.getElementById('status');
            status.innerText = '✅ 保存成功！请刷新网页';
            status.style.color = 'green';
        });
    });
});