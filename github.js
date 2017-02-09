// Code that's specific to Github

var GH = {
    // scan the page to find an ecrypted vault
    scan: function() {
        GH.scanSingleFileBlob();
        GH.scanCommitPR();
    },

    sanitize: function(node) {
        return node.text().trim().replace(/\s/g, '');
    },

    diffText: function(before, after) {
        return before;
    },

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
    // In particular, that the header (first line) will remain the same but the entire rest of the file will diff.
    scanCommitPR: function() {
        var diffs = $('#files .file.js-file');

        $.each(diffs, function(idx, diff) {
            var context = $(diff).find('.blob-code-context:first').text().trim();

            if (context === "$ANSIBLE_VAULT;1.1;AES256") {
                var container = $(diff).find('table.diff-table');
                var deletions = GH.sanitize($(diff).find('.blob-code-deletion')).replace(/-/g, '');
                var additions = GH.sanitize($(diff).find('.blob-code-addition')).replace(/\+/g, '');

                GH.do_decrypt(deletions, null, false, function(deletionsDecrypted) {
                    GH.do_decrypt(additions, null, false, function(additionsDecrypted) {
                        // See https://github.com/kpdecker/jsdiff#change-objects
                        var diff = JsDiff.diffLines(deletionsDecrypted, additionsDecrypted);
                        var diffLines = $.map(diff, function(changeObject) {
                            if (changeObject.added) { return "+" + changeObject.value; }
                            else if (changeObject.removed) { return "-" + changeObject.value; }
                            else { return changeObject.value; }
                        });

                        GH.display_decoded(diffLines.join('\n'), container);
                    });
                });

            }
        });
    },

    scanSingleFileBlob: function() {
        var header = $('.blob-code:first').text();
        var original = null;

        if (header.match(/^\$ANSIBLE_VAULT;.+AES256$/) && !$('#decryptbtn').length) {
            var textToDecrypt = $('.blob-code').not(':first').text();
            var container = $('.js-file-line-container');
            original = container.html();

            // attempt to auto-decrypt if auto-decrypt enabled
            if_auto_decrypt(function() {
                // don't prompt the user for a password on auto-decrypt
                GH.do_decrypt(textToDecrypt, null, false, function(text) { GH.display_decoded(text, container) });
            });

            // Github love to rename their css classes, so this code has to try to be a little resilient to that..
            // will probably still fail anyway on a regular basis
            //
            var $btn_group = $('#raw-url').parent();
            var btn_class = $('#raw-url').attr('class');

            if ($btn_group) {
                $('<a class="minibutton" id="decryptbtn">Decrypt</a>').prependTo($btn_group).click(function() {
                    GH.do_decrypt(textToDecrypt, null, true, function(text) { GH.display_decoded(text, container) });
                }).attr('class', btn_class);

                $('<a class="minibutton" id="undecryptbtn">Original</a>').prependTo($btn_group).click(function() {
                    $(this).hide();
                    $('#decryptbtn').show();
                    container.html(original);
                }).attr('class', btn_class).hide();
            }

            $('.file-info').append('<span class="file-info-divider"></span><span>Encrypted Ansible Vault</span>');
        }
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

    display_decoded: function(text, container) {
        $('#decryptbtn').hide();
        $('#undecryptbtn').show();

        var lines = text.split("\n");
        var rows = [];
        $.each(lines, function(i) {
            var j = i + 1;
            rows.push(
                '<tr>' +
                '<td id="L' + j + '" class="blob-num js-line-number" data-line-number="' + j + '"></td>' +
                '<td id="LC' + j + '" class="blob-code js-file-line"></td>' +
                '</tr>'
            );
        });

        container.html(rows.join("\n"));
        $.each(lines, function(i, line) {
            var j = i + 1;
            $('#LC' + j).html(line.replace(/ /g, "&nbsp;"));
        });
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
var observer = new MutationObserver(GH.scan);

observer.observe($('#js-repo-pjax-container')[0], {
    childList: true,
    subtree: true,
});

// Do a scan on page load.
GH.scan();
