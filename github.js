// Code that's specific to Github

const ADD = 'addition';
const DELETE = 'deletion';
const NONE = 'none';

// See https://gist.github.com/samgiles/762ee337dff48623e729
// [B](f: (A) ⇒ [B]): [B]  ; Although the types in the arrays aren't strict (:
Array.prototype.flatMap = function(lambda) {
  return Array.prototype.concat.apply([], this.map(lambda));
};

function sanitize(node) {
  return node.text().trim().replace(/\s/g, '');
}

class BlobLine {
  constructor(idx, text) {
    this.idx = idx;
    this.text = text.replace(/ /g, "&nbsp;");
  }

  renderHtml() {
    return (
      '<tr>' +
        '<td id="L' + this.idx + '" class="blob-num js-line-number" data-line-number="' + this.idx + '"></td>' +
        '<td id="LC' + this.idx + '" class="blob-code blob-code-inner js-file-line">' + this.text + '</td>' +
      '</tr>'
    );
  }
}

class Blob {
  constructor(blobLines) {
    this.blobLines = blobLines;
  }

  static compute(lines) {
    const blobLines = lines.split('\n').map((line, idx) => { return new BlobLine(idx, line) });
    return new Blob(blobLines);
  }

  static detect() {
    const header = $('.blob-code:first').text();

    if (header.match(/^\$ANSIBLE_VAULT;.+AES256$/) && !$('#decryptbtn').length) {
      const container = $('.js-file-line-container');
      const original = container.html();
      const textToDecrypt = $('.blob-code').not(':first').text();

      // attempt to auto-decrypt if auto-decrypt enabled
      if_auto_decrypt(function() {
        // don't prompt the user for a password on auto-decrypt
        GH.do_decrypt(textToDecrypt, null, false, function(text) {
          Blob.compute(text).show(container);
        });
      });

      // Github love to rename their css classes, so this code has to try to be a little resilient to that..
      // will probably still fail anyway on a regular basis
      //
      const raw_url = $('#raw-url');
      const btn_group = raw_url.parent();
      const btn_class = raw_url.attr('class');

      if (btn_group) {
        $('<a class="minibutton" id="decryptbtn">Decrypt</a>').prependTo(btn_group).click(function() {
          GH.do_decrypt(textToDecrypt, null, true, text => { Blob.compute(text).show(container); });
        }).attr('class', btn_class);

        $('<a class="minibutton" id="undecryptbtn">Original</a>').prependTo(btn_group).click(function() {
          $(this).hide();
          $('#decryptbtn').show();
          container.html(original);
        }).attr('class', btn_class).hide();
      }

      $('.file-info').append('<span class="file-info-divider"></span><span>Encrypted Ansible Vault</span>');
    }
  }

  renderHtml() {
    return this.blobLines.map(bl => bl.renderHtml()).join('\n');
  }

  show(container) {
    $('#decryptbtn').hide();
    $('#undecryptbtn').show();
    container.html(this.renderHtml());
  }
}


class DiffLine {
  constructor(idx, type, text) {
    this.idx = idx;
    this.type = type;
    this.text = text.replace(/ /g, "&nbsp;");
  }

  renderHtml() {
    if (this.type === ADD) {
      return (
        '<tr>' +
          '<td class="blob-num blob-num-addition empty-cell"></td>' +
          '<td id="R' + this.idx + '" class="blob-num blob-num-addition js-linkable-line-number" data-line-number="' + this.idx + '"></td>' +
          '<td class="blob-code blob-code-addition blob-code-inner">+ ' + this.text + '</td>' +
        '</tr>'
      );
    } else if (this.type === DELETE) {
      return (
        '<tr>' +
          '<td id="L' + this.idx + '" class="blob-num blob-num-deletion js-linkable-line-number" data-line-number="' + this.idx + '"></td>' +
          '<td class="blob-num blob-num-deletion empty-cell"></td>' +
          '<td class="blob-code blob-code-deletion blob-code-inner">- ' + this.text + '</td>' +
        '</tr>'
      );
    } else {    // NONE
      return (
        '<tr>' +
          '<td id="L' + this.idx + '" class="blob-num blob-num-context js-linkable-line-number" data-line-number="' + this.idx + '"></td>' +
          '<td id="R' + this.idx + '" class="blob-num blob-num-context js-linkable-line-number" data-line-number="' + this.idx + '"></td>' +
          '<td id="LC' + this.idx + '" class="blob-code blob-code-inner">' + this.text + '</td>' +
        '</tr>'
      );
    }
  }
}

// See https://github.com/kpdecker/jsdiff#change-objects
class Diff {
  constructor(diffLines) {
    this.diffLines = diffLines;
  }

  static compute(removed, added) {
    const diffObjs = JsDiff.diffLines(removed, added);
    let idx = 0;
    const diffLines = diffObjs.flatMap(diffObj => {
      let type;
      if (diffObj.added) {
        type = ADD;
      } else if (diffObj.removed) {
        type = DELETE;
      } else {
        type = NONE;
      }
      const diffObjLines = diffObj.value.split('\n');
      const result = diffObjLines.map((l,i) => new DiffLine(idx+i, type, l));
      idx += diffObjLines.length;
      return result;
    });
    console.log(diffLines);
    return new Diff(diffLines);
  }

  // VERY HACKY, any changes in GitHub will likely break this...
  // We're assuming a diff on vault file will have following format:
  //
  // $ANSIBLE_VAULT;1.1;AES256
  // -
  // - ALL THE OLD STUFF
  // -
  // +
  // + ALL THE NEW STUFF
  // +
  //
  // In particular, that the header (first line) will remain the same but the entire rest of the file will be removals
  // followed by additions.
  static detect() {
    const diffs = $('#files .file.js-file');

    $.each(diffs, (idx,diff) => {
      const context = $(diff).find('.blob-code-context:first').text().trim();

      if (context === "$ANSIBLE_VAULT;1.1;AES256") {
        const container = $(diff).find('table.diff-table');
        const original = container.html();
        const deletions = sanitize($(diff).find('.blob-code-deletion')).replace(/-/g, '');
        const additions = sanitize($(diff).find('.blob-code-addition')).replace(/\+/g, '');

        // // attempt to auto-decrypt if auto-decrypt enabled
        if_auto_decrypt(function() {
          // don't prompt the user for a password on auto-decrypt
          GH.do_decrypt(deletions, null, false, deletionsDecrypted => {
            GH.do_decrypt(additions, null, false, additionsDecrypted => {
              Diff.compute(deletionsDecrypted, additionsDecrypted).show(container);
            });
          });
        });

        GH.do_decrypt(deletions, null, true, deletionsDecrypted => {
          GH.do_decrypt(additions, null, true, additionsDecrypted => {
            Diff.compute(deletionsDecrypted, additionsDecrypted).show(container);
          });
        });
      }
    });
  }

  renderHtml() {
    console.log(this.diffLines);
    return this.diffLines.map(dl => dl.renderHtml()).join('\n');
  }

  show(container) {
    container.html(this.renderHtml());
  }
}


const GH = {
  // scan the page to find an ecrypted vault
  scan: function() {
    Blob.detect();
    Diff.detect();
  },

  handleResponse: function(textToDecrypt, response, prompt_on_fail, callback) {
    switch (response.code) {
      case "ok":
        callback(response.text);
        break;
      case "bad_password":
        if (prompt_on_fail) {
          GH.prompt_and_decrypt(textToDecrypt, callback);
        }
        break;
      default:
        if (prompt_on_fail) {
          display_error(response.error);
        }
    }
  },

  prompt_and_decrypt: function(textToDecrypt, callback) {
    prompt_password(function(pw) {
      GH.do_decrypt(textToDecrypt, pw, true, callback);
    });
  },

  do_decrypt: function(textToDecrypt, password, prompt_on_fail, callback) {
    chrome.runtime.sendMessage({
      op: 'decrypt',
      alg: 'VaultAES256',
      data: textToDecrypt,
      password: password
    }, function(response) {
      GH.handleResponse(textToDecrypt, response, prompt_on_fail, callback);
    });
  },
};


// Github dynamically loads page fragments when switching between blobs instead of doing
// a full page load.  Make sure we catch those.
const observer = new MutationObserver(GH.scan);

observer.observe($('#js-repo-pjax-container')[0], {
  childList: true,
  subtree: true,
});

// Do a scan on page load.
GH.scan();
