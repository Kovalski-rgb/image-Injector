
export class CryptoUtils {

  public async getHash(data: string): Promise<ArrayBuffer> {
    const encodedData = new TextEncoder().encode(data);
    return await window.crypto.subtle.digest("SHA-512", encodedData);
  }

  public async getBinHash(data: string): Promise<string> {
    const numberHash = new Uint8Array(await this.getHash(data)).toString().split(",");
    return numberHash.reduce((acc, cur) => {
      return acc += parseInt(cur).toString(2).padStart(8, "0");
    })
  }

  public async encode(data: string, password: string) {
    let hash = await this.getBinHash(password);
    let aux = "";
    for(let i = 0; i < data.length; i++) {
      const dataBlock = data.charAt(i)
      if(i % hash.length === 0) {
        hash = await this.getBinHash(hash);
      }
      const binBlock = hash.charAt(i%hash.length);
      aux += (parseInt(dataBlock, 2) ^ parseInt(binBlock, 2)).toString(2);
    }
    return aux;
  }

}
