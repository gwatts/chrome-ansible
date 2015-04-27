Ansible Vault Chrome Extension
==============================

This Chrome extension adds a button to Github pages to allow in-browser decryption of 
[Ansible](http://www.ansible.com/) vaults.

All decryption is done in-browser (nothing is transmitted over the network) and passwords
are cached only in-memory (ie. they'll have to be re-entered after restarting Chrome) and
are not accesible to any web resources (including github javascript).

NOTE: This extension is not affiliated with Ansible, Inc. in any way.


Installation
------------

Download the release version from the 
[Chrome store](https://chrome.google.com/webstore/detail/ansible-vault-decryptor/mjebkhaiooleeenllmhgnijapnmbcpfl?hl=en-US&gl=US), 
or clone this repo and enable developer mode in Chrome to load as an unpacked extension.


License
-------

The extension is licensed under a 2-part BSD license.

It includes the [jQuery](http://jquery.com) and [SJCL](https://bitwiseshiftleft.github.io/sjcl/) libraries, 
which have their own licenses.
