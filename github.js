// Code that's specific to Github

var GH = {
    // scan the page to find an ecrypted vault
    scan: function() {
        GH.header = $('.blob-code:first').text();
        GH.cached = null;
        GH.original = null;

        if (GH.header.match(/^\$ANSIBLE_VAULT;.+AES256$/) && !$('#decryptbtn').length) {
            GH.$container = $('.js-file-line-container');
            GH.original = GH.$container.html();

            // attempt to auto-decrypt if auto-decrypt enabled
            if_auto_decrypt(function() {
                // don't prompt the user for a password on auto-decrypt
                GH.do_decrypt(null, false);
            });

            // Github love to rename their css classes, so this code has to try to be a little resilient to that..
            // will probably still fail anyway on a regular basis
            //
            var $btn_group = $('#raw-url').parent();
            var btn_class = $('#raw-url').attr('class');

            if ($btn_group) {
                $('<a class="minibutton" id="decryptbtn">Decrypt</a>').prependTo($btn_group).click(function() {
                    GH.do_decrypt(null, true);
                }).attr('class', btn_class);

                $('<a class="minibutton" id="undecryptbtn">Original</a>').prependTo($btn_group).click(function() {
                    $(this).hide();
                    $('#decryptbtn').show();
                    GH.$container.html(GH.original);
                }).attr('class', btn_class).hide();
            }

            $('.file-info').append('<span class="file-info-divider"></span><span>Encrypted Ansible Vault</span>');
        }
    },

    handleResponse: function(response, prompt_on_fail) {
        switch (response.code) {
            case "ok":
                GH.display_decoded(response.text);
                break;
            case "bad_password":
                if (prompt_on_fail) {
                    GH.prompt_and_decrypt(true);
                }
                break;
            default:
                if (prompt_on_fail) {
                    display_error(response.error);
                }
        }
    },

    display_decoded: function(text) {
        $('#decryptbtn').hide();
        $('#undecryptbtn').show();

        GH.cached = text;
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

        GH.$container.html(rows.join("\n"));
        $.each(lines, function(i, line) {
            var j = i + 1;
            $('#LC' + j).text(line);
        });
    },

    prompt_and_decrypt: function() {
        prompt_password(function(pw) {
            GH.do_decrypt(pw, true);
        });
    },

    do_decrypt: function(password, prompt_on_fail) {
        var payload;

        payload = $('.blob-code').not(':first').text();
        if (GH.cached) {
            GH.display_decoded(GH.cached);
        } else {
            chrome.runtime.sendMessage({
                op: 'decrypt',
                alg: 'VaultAES256',
                data: payload,
                password: password
            }, function(response) {
                GH.handleResponse(response, prompt_on_fail);
            });
        }
    },
};


// Github dynamically loads page fragments when switching between blobs instead of doing
// a full page load.  Make sure we catch those.
var observer = new MutationObserver(GH.scan);

observer.observe($('#js-repo-pjax-container')[0], {
    childList: true
});

// Do a scan on page load.
GH.scan();
