// Code that's specific to Github

const ADD = 'addition';
const DELETE = 'deletion';
const NONE = 'none';

class BlobLine {
  constructor(idx, text) {
    this.lineNumber = idx;
    this.text = text.replace(/ /g, "&nbsp;");
  }

  renderHtml() {
    return `
      <tr>
        <td id="L${this.lineNumber}" class="blob-num js-line-number" data-line-number="${this.lineNumber}"></td>
        <td id="LC${this.lineNumber}" class="blob-code blob-code-inner js-file-line">${this.text}</td>
      </tr>
    `;
  }
}

class DiffLine {
  constructor(fileName, fileAnchor, lineNumber, type, text) {
    this.fileName = fileName;
    this.fileAnchor = fileAnchor;
    this.lineNumber = lineNumber;
    this.type = type;
    this.text = text.replace(/ /g, "&nbsp;");
  }

  renderHtml() {
    if (this.type === ADD) {
      return `
        <tr>
          <td class="blob-num blob-num-addition empty-cell"></td>
          <td id="${this.fileAnchor}R${this.lineNumber}" class="blob-num blob-num-addition js-linkable-line-number" data-line-number="${this.lineNumber}"></td>
          <td class="blob-code blob-code-addition">
            <span class="blob-code-inner">+ ${this.text}</span>
          </td>
        </tr>
      `;
    } else if (this.type === DELETE) {
      return `
        <tr>
          <td id="${this.fileAnchor}L${this.lineNumber}" class="blob-num blob-num-deletion js-linkable-line-number" data-line-number="${this.lineNumber}"></td>
          <td class="blob-num blob-num-deletion empty-cell"></td>
          <td class="blob-code blob-code-deletion">
            <span class="blob-code-inner">- ${this.text}</span>
          </td>
        </tr>
      `;
    } else {    // NONE
      return `
        <tr>
          <td id="${this.fileAnchor}L${this.lineNumber}" class="blob-num blob-num-context js-linkable-line-number" data-line-number="${this.lineNumber}"></td>
          <td id="${this.fileAnchor}R${this.lineNumber}" class="blob-num blob-num-context js-linkable-line-number" data-line-number="${this.lineNumber}"></td>
          <td class="blob-code blob-code-context">
            <span class="blob-code-inner">${this.text}</span>
          </td>
        </tr>
      `;
    }
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

// See https://github.com/kpdecker/jsdiff#change-objects
class Diff {
  constructor(fileAnchor, diffLines) {
    this.fileAnchor = fileAnchor;
    this.diffLines = diffLines;
  }

  static compute(fileName, fileAnchor, removed, added) {
    const diffObjs = JsDiff.diffLines(removed, added);
    let lineNumber = 0;
    const diffLines = diffObjs.flatMap(diffObj => {
      let type;
      if (diffObj.added) {
        type = ADD;
      } else if (diffObj.removed) {
        type = DELETE;
      } else {
        type = NONE;
      }
      let diffObjLines = diffObj.value.split('\n');
      // split causes us to have an extra empty line at the end
      if (diffObjLines[diffObjLines.length-1].length === 0) {
        diffObjLines = diffObjLines.slice(0, -1);
      }
      const result = diffObjLines.map((l,i) => { return new DiffLine(fileName, fileAnchor, lineNumber+i, type, l) });
      lineNumber += diffObjLines.length;
      return result;
    });
    return new Diff(fileAnchor, diffLines);
  }

  // We're assuming a diff on vault file will have following format:
  //
  // $ANSIBLE_VAULT;1.1;AES256          (ansible vault header)
  // - DELETIONS                        (all the deletions)
  // + ADDITIONS                        (all the additions)
  //
  static detect() {
    const files = $('#files .file.js-file');
    console.log('XX detect');

    $.each(files, (idx,file) => {
      const context = $(file).find('.blob-code-context:first').text().trim();
      const fileHeader = $(file).find('.file-header');
      const fileName = $(fileHeader).attr('data-path');
      const fileAnchor = $(fileHeader).attr('data-anchor');

      if (context === "$ANSIBLE_VAULT;1.1;AES256" && !$('#' + fileAnchor + '-decryptbtn').length) {
        const container = $(file).find('table.diff-table');
        const original = container.html();
        const deletions = sanitize($(file).find('.blob-code-deletion')).replace(/-/g, '');
        const additions = sanitize($(file).find('.blob-code-addition')).replace(/\+/g, '');

        // // attempt to auto-decrypt if auto-decrypt enabled
        if_auto_decrypt(function() {
          // don't prompt the user for a password on auto-decrypt
          GH.do_decrypt(deletions, null, false, deletionsDecrypted => {
            GH.do_decrypt(additions, null, false, additionsDecrypted => {
              Diff.compute(fileName, fileAnchor, deletionsDecrypted, additionsDecrypted).show(container);
            });
          });
        });

        const actions = $(file).find('.file-actions').first();

        if (actions) {
          $('<a class="minibutton btn btn-sm" id="' + fileAnchor + '-decryptbtn">Decrypt</a>').prependTo(actions).click(function() {
            GH.do_decrypt(deletions, null, true, deletionsDecrypted => {
              GH.do_decrypt(additions, null, true, additionsDecrypted => {
                Diff.compute(fileName, fileAnchor, deletionsDecrypted, additionsDecrypted).show(container);
              });
            });
          });

          $('<a class="minibutton btn btn-sm" id="' + fileAnchor + '-undecryptbtn">Original</a>').prependTo(actions).click(function() {
            $(this).hide();
            $('#' + fileAnchor + '-decryptbtn').show();
            container.html(original);
          }).hide();
        }
      }
    });
  }

  renderHtml() {
    return this.diffLines.map(dl => dl.renderHtml()).join('\n');
  }

  show(container) {
    $('#' + this.fileAnchor + '-decryptbtn').hide();
    $('#' + this.fileAnchor + '-undecryptbtn').show();
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
