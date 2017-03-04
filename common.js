// Common routines injected into all matching pages

function display_error(err) {
    alert(err); // TODO improve!
}

// Display password prompt modal dialog
function prompt_password(cb) {
    var dlg = $('<div id="cryptdialog" style="display: none"><p>Decryption password: <input type="password" id="decryptpw"></p></div>').appendTo('body');
    // Pressing return in the input box should be the same as clicking OK
    dlg.find('input').keypress(function(e) {
        if (e.keyCode == $.ui.keyCode.ENTER) {
            $('#cryptdialog').parent().find('button:contains(OK)').click();
        }
    });
    $('#cryptdialog').dialog({
        title: 'Ansible Vault Decryptor',
        modal: true,
        height: 'auto',
        width: 400,
        hide: 100,
        resizeable: false,
        buttons: [{
            text: "Cancel",
            click: function() {
                // destroy the dialog and the input containing the password
                $(this).dialog('destroy');
                dlg.remove();
            }
        }, {
            text: 'OK',
            click: function() {
                var pw = $('#decryptpw').val();
                $(this).dialog('destroy');
                dlg.remove();
                cb(pw);
            }
        }, ]
    });
}

// Run the callback if auto_decrypt is turned on in the options.
function if_auto_decrypt(cb) {
    chrome.storage.sync.get({
        autoDecrypt: true
    }, function(items) {
        if (items.autoDecrypt) {
            cb();
        }
    });
}

// See https://gist.github.com/samgiles/762ee337dff48623e729
// [B](f: (A) ⇒ [B]): [B]  ; Although the types in the arrays aren't strict (:
Array.prototype.flatMap = function(lambda) {
    return Array.prototype.concat.apply([], this.map(lambda));
};

function sanitize(node) {
    return node.text().trim().replace(/\s/g, '');
}
