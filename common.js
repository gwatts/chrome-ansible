// Common routines injected into all matching pages
let AnsibleVaultDecryptor = {
  display_error: function(err) {
    alert(err); // TODO improve!
  },

  // Display password prompt modal dialog
  prompt_password: function(cb) {
    const dlg = $('<div id="cryptdialog" style="display: none"><p>Decryption password: <input type="password" id="decryptpw"></p></div>').appendTo('body');
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
          const pw = $('#decryptpw').val();
          $(this).dialog('destroy');
          dlg.remove();
          cb(pw);
        }
      }, ]
    });
  },

  // Run the callback if auto_decrypt is turned on in the options.
  if_auto_decrypt: function(cb) {
    chrome.storage.sync.get({
      autoDecrypt: true
    }, function(items) {
      if (items.autoDecrypt) {
        cb();
      }
    });
  },

  handle_response: function(textToDecrypt, response, prompt_on_fail, callback) {
    switch (response.code) {
      case "ok":
        callback(response.text);
        break;
      case "bad_password":
        if (prompt_on_fail) {
          this.prompt_and_decrypt(textToDecrypt, callback);
        }
        break;
      default:
        if (prompt_on_fail) {
          this.display_error(response.error);
        }
    }
  },

  prompt_and_decrypt: function(textToDecrypt, callback) {
    this.prompt_password(pw => { this.do_decrypt(textToDecrypt, pw, true, callback); });
  },

  do_decrypt: function(textToDecrypt, password, prompt_on_fail, callback) {
    if (textToDecrypt.length === 0) {
      callback(textToDecrypt);
    } else {
      chrome.runtime.sendMessage({
        op: 'decrypt',
        alg: 'VaultAES256',
        data: textToDecrypt,
        password: password
      }, response => {
        this.handle_response(textToDecrypt, response, prompt_on_fail, callback);
      });
    }
  },

  do_decrypt_async: function(textToDecrypt, password, prompt_on_fail) {
    return new Promise((resolve, _) => {
      AnsibleVaultDecryptor.do_decrypt(textToDecrypt, password, prompt_on_fail, resolve);
    });
  }
};

// See https://gist.github.com/samgiles/762ee337dff48623e729
// [B](f: (A) ⇒ [B]): [B]  ; Although the types in the arrays aren't strict (:
Array.prototype.avd_flatmap = function(lambda) {
  return Array.prototype.concat.apply([], this.map(lambda));
};
