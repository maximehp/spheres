///////////////////////////////////////////////////////
// AES-GCM encryption helpers + base64url utilities
///////////////////////////////////////////////////////

async function deriveKey(password) {
    const enc = new TextEncoder();
    const material = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        "PBKDF2",
        false,
        ["deriveBits", "deriveKey"]
    );

    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: enc.encode("spheres-salt"),
            iterations: 200000,
            hash: "SHA-256",
        },
        material,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

function base64url(buf) {
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlToBuf(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    const pad = str.length % 4;
    if (pad) str += "=".repeat(4 - pad);
    const bin = atob(str);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
}

async function encryptState(obj, password) {
    const key = await deriveKey(password);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const jsonData = new TextEncoder().encode(JSON.stringify(obj));

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        jsonData
    );

    const out = new Uint8Array(iv.length + encrypted.byteLength);
    out.set(iv, 0);
    out.set(new Uint8Array(encrypted), iv.length);
    return base64url(out);
}

async function decryptState(encoded, password) {
    const raw = base64urlToBuf(encoded);
    const iv = raw.slice(0, 12);
    const data = raw.slice(12);

    const key = await deriveKey(password);
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        data
    );

    const json = new TextDecoder().decode(decrypted);
    return JSON.parse(json);
}
