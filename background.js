// Code that runs in the background in Chrome
// 
// This caches entered passwords in memory; nothing is saved to disk.



// sjcl doesn't implement AES-CTR as of 2015-02-08 so i added it
sjcl.mode.ctr = {
    name: 'ctr',

    decrypt: function(prf, data, iv) {
        var i, enc, w = sjcl.bitArray,
            ctr, l = data.length,
            bl = w.bitLength(data);
        ctr = w.concat(iv, [0, 0, 0]).slice(0, 4);
        for (i = 0; i < l; i += 4) {
            enc = prf.encrypt(ctr);
            ctr[3] ++;
            data[i] ^= enc[0];
            data[i + 1] ^= enc[1];
            data[i + 2] ^= enc[2];
            data[i + 3] ^= enc[3];
        }
        return {
            data: w.clamp(data, bl)
        };
    }
};


var Ansible = {};

Ansible.VaultAES256 = {
    gen_key_initctr: function(password, salt) {
        var keylength = 32,
            ivlength = 16,
            derived_key = sjcl.misc.pbkdf2(password, salt, 10000, 8 * ((2 * keylength) + ivlength)),
            key1 = sjcl.bitArray.bitSlice(derived_key, 0, keylength * 8),
            key2 = sjcl.bitArray.bitSlice(derived_key, keylength * 8, keylength * 8 * 2),
            iv = sjcl.bitArray.bitSlice(derived_key, keylength * 8 * 2, (keylength * 8 * 2) + (ivlength * 8));
        return {
            key1: key1,
            key2: key2,
            iv: iv
        };
    },

    decrypt: function(data, password) {
        var v256 = Ansible.VaultAES256,
            fromHex = sjcl.codec.hex.toBits,
            toUtf8 = sjcl.codec.utf8String.fromBits,
            parts, salt, crypted_hmac, crypted_data, hmac, k, aes, result;

        try {
            data = toUtf8(fromHex(data.replace(/[^0-9a-fA-F]+/m, '')));
        } catch (e) {
            return {
                error: 'Data is corrupt',
                code: 'data_corrupt'
            };
        }

        parts = data.split("\n");
        if (parts.length < 3) {
            return {
                error: 'Data is corrupt',
                code: 'data_corrupt'
            };
        }

        salt = fromHex(parts[0]);
        crypted_hmac = fromHex(parts[1]);
        crypted_data = fromHex(parts[2]);
        k = v256.gen_key_initctr(password, salt);

        // validate data integrity
        hmac = new sjcl.misc.hmac(k.key2, sjcl.hash.sha256);
        if (!sjcl.bitArray.equal(hmac.encrypt(crypted_data), crypted_hmac)) {
            return {
                error: 'Invalid password',
                code: 'bad_password'
            };
        }

        aes = new sjcl.cipher.aes(k.key1);
        result = sjcl.mode.ctr.decrypt(aes, crypted_data, k.iv);
        return {
            text: toUtf8(result.data),
            code: 'ok'
        };
    }
};

// The Decryptor keeps an in-memory copy of any passwords that have
// been succesfully used and tries them all when it comes across a vault it
// hasn't seen yet.
Ansible.Decryptor = {
    passwords: [],
    pw_cache: {},

    decrypt: function(algname, data, password) {
        var d = Ansible.Decryptor,
            alg = Ansible[algname],
            hash = sjcl.hash.sha256.hash(data),
            i, result, pw;

        if (!alg) {
            return {
                error: 'Unknown encryption algorithm',
                code: 'unknown_alg'
            };
        }

        if (password) {
            // explicitly specified password
            result = alg.decrypt(data, password);
            if (result.code == 'ok') {
                d.add_password(password, hash);
            }
            return result;
        }

        // if we've successfully decrypted this data before then use the same password
        pw = d.pw_cache[hash];
        if (pw) {
            result = alg.decrypt(data, pw);
            if (result.code == 'ok') {
                return result;
            }
        }

        if (!d.passwords.length) {
            // no cached passwords and none supplied
            return {
                error: 'Invalid password',
                code: 'bad_password'
            };
        }

        // Try all the registered passwords
        for (i = 0; i < d.passwords.length; i++) {
            pw = d.passwords[i];
            result = alg.decrypt(data, pw);
            if (result.code && result.code == 'bad_password') {
                continue;
            }
        }

        if (result.code == 'ok') {
            // cache the password for this hash
            d.add_password(pw, hash);
        }

        return result;
    },

    add_password: function(new_password, hash) {
        var d = Ansible.Decryptor;

        if (hash) {
            d.pw_cache[hash] = new_password;
        }
        if (d.passwords.indexOf(new_password) == -1 && new_password.length) {
            d.passwords.push(new_password);
        }
    },
};




// process requests from the injected site scripts
chrome.extension.onMessage.addListener(
    function(request, sender, sendResponse) {
        switch (request.op) {
            case 'decrypt':
                sendResponse(Ansible.Decryptor.decrypt(request.alg, request.data, request.password));
                break;
            case 'add_password':
                sendResponse(Ansible.Decryptor.add_password(request.new_password));
                break;
            default:
                sendResponse({
                    error: 'Unknown operation sent to decryptor backend',
                    code: 'bad_operation'
                });
        }
    }
);