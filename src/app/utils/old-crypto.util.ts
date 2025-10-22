// https://github.com/mdn/dom-examples/blob/main/web-crypto/derive-key/pbkdf2.js

export class OldCryptoUtils {

  private salt: any;
  private iv: any;
  constructor() {
    this.salt = new Uint8Array(1);
    this.iv = new Uint8Array(1);
  }


  /*
  Fetch the contents of the "message" textbox, and encode it
  in a form we can use for the encrypt operation.
  */
  private getMessageEncoding(message: string) {
    let enc = new TextEncoder();
    return enc.encode(message);
  }

  /*
  Get some key material to use as input to the deriveKey method.
  The key material is a password supplied by the user.
  */
  private getKeyMaterial(password: string) {
    let enc = new TextEncoder();
    return window.crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      {name: "PBKDF2"},
      false,
      ["deriveBits", "deriveKey"]
    );
  }

  /*
  Given some key material and some random salt
  derive an AES-GCM key using PBKDF2.
  */
  private getKey(keyMaterial: CryptoKey, salt: any) {
    return window.crypto.subtle.deriveKey(
      {
        "name": "PBKDF2",
        salt: salt,
        "iterations": 100000,
        "hash": "SHA-256"
      },
      keyMaterial,
      { "name": "AES-GCM", "length": 256},
      true,
      [ "encrypt", "decrypt" ]
    );
  }

  /*
  Derive a key from a password supplied by the user, and use the key
  to encrypt the message.
  Update the "ciphertextValue" box with a representation of part of
  the ciphertext.
  */
  public async encrypt(data: string, password: string): Promise<ArrayBuffer> {
    let keyMaterial = await this.getKeyMaterial(password);
    let key = await this.getKey(keyMaterial, this.salt);
    let encoded = this.getMessageEncoding(data);
    return await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: this.iv },
      key,
      encoded
    );
  }

  /*
  Derive a key from a password supplied by the user, and use the key
  to decrypt the ciphertext.
  If the ciphertext was decrypted successfully,
  update the "decryptedValue" box with the decrypted value.
  If there was an error decrypting,
  update the "decryptedValue" box with an error message.
  */
  public async decrypt(data: string, password: string): Promise<string>;
  public async decrypt(data: ArrayBuffer | string, password: string): Promise<string> {
    if(typeof data === "string") {
      data = this.stringToArrayBuffer(data);
    }
    data = data as ArrayBuffer;

    let keyMaterial = await this.getKeyMaterial(password);
    let key = await this.getKey(keyMaterial, this.salt);
    let decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: this.iv },
      key,
      data
    );
    let dec = new TextDecoder();
    return dec.decode(decrypted);
  }

  public stringToArrayBuffer(string: string): ArrayBuffer {
    return new Uint8Array((string as any).toString().split(",")).buffer;
  }

  public arrayBufferToString(array: ArrayBuffer): string {
    return new Uint8Array(array).toString()
  }

}
