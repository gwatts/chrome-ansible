var autoBtn = document.getElementById('auto-decrypt');
autoBtn.addEventListener('click', function() {
    chrome.storage.sync.set({
        autoDecrypt: autoBtn.checked
    });
});

chrome.storage.sync.get({
    autoDecrypt: true
}, function(items) {
    autoBtn.checked = items.autoDecrypt;
});
