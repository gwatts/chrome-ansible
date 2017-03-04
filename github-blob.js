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
        do_decrypt(textToDecrypt, null, false, function(text) {
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
          do_decrypt(textToDecrypt, null, true, text => { Blob.compute(text).show(container); });
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
