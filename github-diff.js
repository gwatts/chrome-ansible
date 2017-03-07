const ADD = 'addition';
const DELETE = 'deletion';
const NONE = 'none';

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
          do_decrypt(deletions, null, false, deletionsDecrypted => {
            do_decrypt(additions, null, false, additionsDecrypted => {
              Diff.compute(fileName, fileAnchor, deletionsDecrypted, additionsDecrypted).show(container);
            });
          });
        });

        const actions = $(file).find('.file-actions').first();

        if (actions) {
          $('<a class="minibutton btn btn-sm" id="' + fileAnchor + '-decryptbtn">Decrypt</a>').prependTo(actions).click(function() {
            do_decrypt(deletions, null, true, deletionsDecrypted => {
              do_decrypt(additions, null, true, additionsDecrypted => {
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
