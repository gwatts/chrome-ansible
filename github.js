let GitHub = {
  ADD: 'addition',
  DELETE: 'deletion',
  NONE: 'none'
};

GitHub.BlobLine = class {
  constructor(idx, text) {
    this.line_number = idx;
    this.text = text.replace(/ /g, "&nbsp;");
  }

  renderHtml() {
    return `
      <tr>
        <td id="L${this.line_number}" class="blob-num js-line-number" data-line-number="${this.line_number}"></td>
        <td id="LC${this.line_number}" class="blob-code blob-code-inner js-file-line">${this.text}</td>
      </tr>
    `;
  }
};

GitHub.Blob = class {
  constructor(blob_lines) {
    this.blob_lines = blob_lines;
  }

  static compute(lines) {
    const blob_lines = lines.split('\n').map((line, idx) => { return new GitHub.BlobLine(idx, line) });
    return new GitHub.Blob(blob_lines);
  }

  static detect() {
    const header = $('.blob-code:first').text();

    if (header.match(/^\$ANSIBLE_VAULT;.+AES256$/) && !$('#decryptbtn').length) {
      const container = $('.js-file-line-container');
      const original = container.html();
      const text_to_decrypt = $('.blob-code').not(':first').text();

      // attempt to auto-decrypt if auto-decrypt enabled
      AnsibleVaultDecryptor.if_auto_decrypt(function() {
        // don't prompt the user for a password on auto-decrypt
        AnsibleVaultDecryptor.do_decrypt(text_to_decrypt, null, false, function(text) {
          GitHub.Blob.compute(text).show(container);
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
          AnsibleVaultDecryptor.do_decrypt(text_to_decrypt, null, true, text => { GitHub.Blob.compute(text).show(container); });
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
    return this.blob_lines.map(bl => bl.renderHtml()).join('\n');
  }

  show(container) {
    $('#decryptbtn').hide();
    $('#undecryptbtn').show();
    container.html(this.renderHtml());
  }
};

GitHub.DiffLine = class {
  constructor(file_name, file_anchor, line_number, type, text) {
    this.file_name = file_name;
    this.file_anchor = file_anchor;
    this.line_number = line_number;
    this.type = type;
    this.text = text.replace(/ /g, "&nbsp;");
  }

  renderHtml() {
    switch (this.type) {
      case GitHub.ADD: {
        return `
          <tr>
            <td class="blob-num blob-num-addition empty-cell"></td>
            <td id="${this.file_anchor}R${this.line_number}" class="blob-num blob-num-addition js-linkable-line-number" data-line-number="${this.line_number}"></td>
            <td class="blob-code blob-code-addition">
              <span class="blob-code-inner">+ ${this.text}</span>
            </td>
          </tr>
        `;
      }
      case GitHub.DELETE: {
        return `
          <tr>
            <td id="${this.file_anchor}L${this.line_number}" class="blob-num blob-num-deletion js-linkable-line-number" data-line-number="${this.line_number}"></td>
            <td class="blob-num blob-num-deletion empty-cell"></td>
            <td class="blob-code blob-code-deletion">
              <span class="blob-code-inner">- ${this.text}</span>
            </td>
          </tr>
        `;
      }
      case GitHub.NONE: {
        return `
          <tr>
            <td id="${this.file_anchor}L${this.line_number}" class="blob-num blob-num-context js-linkable-line-number" data-line-number="${this.line_number}"></td>
            <td id="${this.file_anchor}R${this.line_number}" class="blob-num blob-num-context js-linkable-line-number" data-line-number="${this.line_number}"></td>
            <td class="blob-code blob-code-context">
              <span class="blob-code-inner">${this.text}</span>
            </td>
          </tr>
        `;
      }
    }
  }
}

// See https://github.com/kpdecker/jsdiff#change-objects
GitHub.Diff = class {
  constructor(file_anchor, diff_lines) {
    this.file_anchor = file_anchor;
    this.diff_lines = diff_lines;
  }

  static compute(file_name, file_anchor, removed, added) {
    const diff_objs = JsDiff.diff_lines(removed.trim(), added.trim());
    let line_number = 0;
    const diff_lines = diff_objs.avd_flatmap(diff_obj => {
      let type;
      if (diff_obj.added) {
        type = GitHub.ADD;
      } else if (diff_obj.removed) {
        type = GitHub.DELETE;
      } else {
        type = GitHub.NONE;
      }
      let diff_obj_lines = diff_obj.value.split('\n');
      // split causes us to have an extra empty line at the end
      if (diff_obj_lines[diff_obj_lines.length-1].length === 0) {
        diff_obj_lines = diff_obj_lines.slice(0, -1);
      }
      const result = diff_obj_lines.map((l,i) => { return new GitHub.DiffLine(file_name, file_anchor, line_number+i, type, l) });
      line_number += diff_obj_lines.length;
      return result;
    });
    return new GitHub.Diff(file_anchor, diff_lines);
  }

  // We're assuming a diff on vault file will have following format:
  //
  // $ANSIBLE_VAULT;1.1;AES256          (ansible vault header)
  // - DELETIONS                        (all the deletions)
  // + ADDITIONS                        (all the additions)
  //
  static detect() {
    const files = $('#files .file.js-file');

    $.each(files, (idx,file) => {
      const context = $(file).find('.blob-code-context:first').text().trim();
      const file_header = $(file).find('.file-header');
      const file_name = $(file_header).attr('data-path');
      const file_anchor = $(file_header).attr('data-anchor');

      if (context === "$ANSIBLE_VAULT;1.1;AES256" && !$('#' + file_anchor + '-decryptbtn').length) {
        // hide the unified|split menu since this doesn't work in split mode
        $(".diffbar-item .BtnGroup").hide();

        const container = $(file).find('table.diff-table');
        const original = container.html();
        const deletions = AnsibleVaultDecryptor.sanitize($(file).find('.blob-code-deletion')).replace(/-/g, '');
        const additions = AnsibleVaultDecryptor.sanitize($(file).find('.blob-code-addition')).replace(/\+/g, '');

        // // attempt to auto-decrypt if auto-decrypt enabled
        AnsibleVaultDecryptor.if_auto_decrypt(function() {
          // don't prompt the user for a password on auto-decrypt
          AnsibleVaultDecryptor.do_decrypt(deletions, null, false, deletionsDecrypted => {
            AnsibleVaultDecryptor.do_decrypt(additions, null, false, additionsDecrypted => {
              GitHub.Diff.compute(file_name, file_anchor, deletionsDecrypted, additionsDecrypted).show(container);
            });
          });
        });

        const actions = $(file).find('.file-actions').first();

        if (actions) {
          $('<a class="minibutton btn btn-sm" id="' + file_anchor + '-decryptbtn">Decrypt</a>').prependTo(actions).click(function() {
            AnsibleVaultDecryptor.do_decrypt(deletions, null, true, deletionsDecrypted => {
              AnsibleVaultDecryptor.do_decrypt(additions, null, true, additionsDecrypted => {
                GitHub.Diff.compute(file_name, file_anchor, deletionsDecrypted, additionsDecrypted).show(container);
              });
            });
          });

          $('<a class="minibutton btn btn-sm" id="' + file_anchor + '-undecryptbtn">Original</a>').prependTo(actions).click(function() {
            $(this).hide();
            $('#' + file_anchor + '-decryptbtn').show();
            container.html(original);
          }).hide();
        }
      }
    });
  }

  renderHtml() {
    return this.diff_lines.map(dl => dl.renderHtml()).join('\n');
  }

  show(container) {
    $('#' + this.file_anchor + '-decryptbtn').hide();
    $('#' + this.file_anchor + '-undecryptbtn').show();
    container.html(this.renderHtml());
  }
};

GitHub.Scan = function() {
  GitHub.Blob.detect();
  GitHub.Diff.detect();
};

// Github dynamically loads page fragments when switching between blobs instead of doing
// a full page load.  Make sure we catch those.
const observer = new MutationObserver(GitHub.Scan);

observer.observe($('#js-repo-pjax-container')[0], {
  childList: true,
  subtree: true,
});

// Do a scan on page load.
GitHub.Scan();
