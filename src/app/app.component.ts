import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ValidatorsUtils } from './utils/validators';
import { CryptoUtils } from './utils/crypto.util';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {

  @ViewChild("previewCanvas") canvas: ElementRef<HTMLCanvasElement>;
  @ViewChild("fileInput") fileInput: ElementRef<HTMLInputElement>;
  @ViewChild("imgInput") imgInput: ElementRef<HTMLInputElement>;

  readonly REGEX_REMOVE_FILE_SUFFIX =/(?:.(?!\.))+$/;

  readonly RESERVED_PIXELS_BEFORE_HEADER = 1;
  readonly CHANNELS_PER_PIXEL = 4;
  readonly DEFAULT_BITES_PER_CHANNEL = 2;
  readonly DEFAULT_HEADER_SIZE_IN_BITS = 640;
  readonly TOTAL_COLOR_CHANNELS = 3;
  readonly MAX_FILE_NAME = 10;
  readonly MESSAGE_TIMEOUT = 3500;

  protected linkForm: FormGroup;
  protected fileForm: FormGroup;
  protected passwordForm: FormGroup;
  protected bitsPerChannel = this.DEFAULT_BITES_PER_CHANNEL;
  protected imgAvailableBytes = 0;

  protected errorTimeout: any;
  protected currentErrorStatus = "";

  protected fileMetadata = {
    type: "",
    size: 0,
  }

  protected isImgLoaded = false;
  protected isFileLoaded = false;

  protected fileContents: ArrayBuffer;

  protected canvasW = 0;
  protected canvasH = 0;
  protected password: string = "";

  constructor(
    private fb: FormBuilder
  ) {
  }

  ngOnInit() {
    // does not work, moving on....
    this.linkForm = this.fb.group({ link: [null, Validators.required] });
    this.fileForm = this.fb.group({ file: [null, Validators.required] });
    this.passwordForm = this.fb.group(
      {
        password: ['', Validators.required],
        confirmPassword: ['']
      },
      {
        validators: ValidatorsUtils.matchValidator('password', 'confirmPassword')
      }
    );
  }

  protected setPassword() {
    this.password = this.confirmPasswordField?.value;
  }

  get confirmPasswordField() {
    return this.passwordForm.get("confirmPassword")
  }

  protected updateImgLink() {
    this.isImgLoaded = false;
    const files = this.imgInput.nativeElement.files;
    if (!files || !files[0]) throw "No file has been selected!";
    const file = files[0];

    const reader = new FileReader();
    reader.onload = (event) => {

      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = async () => {
        const bitmap = await createImageBitmap(img);
        this.canvasH = img.height;
        this.canvasW = img.width;
        this.imgAvailableBytes = ( 
          ((this.canvasH * this.canvasW * this.TOTAL_COLOR_CHANNELS * this.bitsPerChannel) -
           this.RESERVED_PIXELS_BEFORE_HEADER*this.TOTAL_COLOR_CHANNELS) / 8 ) - this.DEFAULT_HEADER_SIZE_IN_BITS / 8;
        this.isImgLoaded = true;
        setTimeout(() => {
          this.canvas.nativeElement.getContext("2d", { willReadFrequently: true })?.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
        }, 1);
      }
      img.src = event.target?.result as string;
    }
    reader.readAsDataURL(file);
  }

  protected updateSlider(sliderValue: number) {
    this.bitsPerChannel = sliderValue;
    this.imgAvailableBytes = (this.canvasH * this.canvasW * this.TOTAL_COLOR_CHANNELS * this.bitsPerChannel) / 8;
  }

  protected handleFile() {
    const files = this.fileInput.nativeElement.files;
    if (!files || !files[0]) throw "No file has been selected!";
    const file = files[0];

    const reader = new FileReader();
    reader.onload = (event) => {
      this.isFileLoaded = true;
      this.fileMetadata = {
        size: file.size,
        type: file.type,
      }
      this.fileContents = event?.target?.result as ArrayBuffer;
    }
    reader.readAsArrayBuffer(file);
  }

  protected parseSize(size: number): string {
    if (size > 1000000000) {
      return `${Math.round((size / 1000000000) * 100) / 100} GB`;
    }
    if (size > 1000000) {
      return `${Math.round((size / 1000000) * 100) / 100} MB`;
    }
    if (size > 1000) {
      return `${Math.round((size / 1000) * 100) / 100} KB`;
    }
    return `${size} bytes`;
  }

  protected fileToBin(file: ArrayBuffer): string {
    const dataView = new DataView(file);
    let binaryString = "";

    for (let i = 0; i < file.byteLength; i++) {
      const byte = dataView.getUint8(i);
      binaryString += byte.toString(2).padStart(8, '0');
    }
    return binaryString;
  }

  protected binToFile(binaryString: string, filetype: string, filename = 'output') {
    if (filetype === "") filetype = 'application/octet-stream';
    const byteLength = binaryString.length / 8;
    const rawBytes = new Uint8Array(byteLength);
    for (let i = 0; i < byteLength; i++) {
      const start = i * 8;
      const byte = parseInt(binaryString.substring(start, start + 8), 2);
      rawBytes[i] = byte;
    }

    const blob = new Blob([rawBytes], { type: filetype });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    a.remove();
  }

  protected downloadCurrentCanvas() {
    const a = document.createElement('a');
    a.href = this.canvas.nativeElement.toDataURL('image/png', 1);
    a.download = "output";
    a.click();
    a.remove();
  }

  protected async extractDataFromImage() {
    this.currentErrorStatus = "";
    const ctx = this.canvas.nativeElement.getContext("2d");
    let extractedData = "";

    const imgData = ctx?.getImageData(0, 0, this.canvasW, this.canvasH) as ImageData;
    let data = imgData.data;

    const headerOffset = this.RESERVED_PIXELS_BEFORE_HEADER*this.CHANNELS_PER_PIXEL;
    let bpc = "";
    for(let i = 0; i < headerOffset; i++) {
        bpc += data[i].toString(2).padStart(8, "0").substring(7)
    }
    this.bitsPerChannel = parseInt(bpc, 2);

    if (this.bitsPerChannel > 8 || this.bitsPerChannel < 1) {
      this.currentErrorStatus = "Corrupted image metadata";
      clearTimeout(this.errorTimeout);
      this.errorTimeout = setTimeout(() => {
        this.currentErrorStatus = "";
      }, this.MESSAGE_TIMEOUT);
      throw this.currentErrorStatus;
    }

    for (let i = headerOffset; i < data.length; i += 4) {
      extractedData += data[i + 0].toString(2).padStart(8, '0').substring(8 - this.bitsPerChannel);
      extractedData += data[i + 1].toString(2).padStart(8, '0').substring(8 - this.bitsPerChannel);
      extractedData += data[i + 2].toString(2).padStart(8, '0').substring(8 - this.bitsPerChannel);
      // const alpha = data[i + 3];
      // no alpha https://stackoverflow.com/questions/23497925/how-can-i-stop-the-alpha-premultiplication-with-canvas-imagedata/23501676#23501676
    }
    let header;
    try {
      let binHeader = extractedData.substring(0, this.DEFAULT_HEADER_SIZE_IN_BITS);
      if(this.passwordForm.valid) {
        binHeader =  await this.encryptBin(binHeader);
      }
      const strHeader = this.binToString(binHeader);
      header = JSON.parse(strHeader);
    } catch (e) {
      this.currentErrorStatus = "Corrupted image header, wrong password or this image does not contain anything.";
      clearTimeout(this.errorTimeout);
      this.errorTimeout = setTimeout(() => {
        this.currentErrorStatus = "";
      }, this.MESSAGE_TIMEOUT);
      throw this.currentErrorStatus;
    }
    let binExtractedData = extractedData.substring(this.DEFAULT_HEADER_SIZE_IN_BITS, this.DEFAULT_HEADER_SIZE_IN_BITS + (header.size * 8));
    if(this.passwordForm.valid) {
      binExtractedData = await this.encryptBin(binExtractedData);
    }
    this.binToFile(binExtractedData, header.type);
  }

  protected stringToBin(data: string): string {
    let bin = "";
    for (let char of data) {
      bin += (char.charCodeAt(0).toString(2).padStart(8, "0"));
    }
    return bin;
  }

  protected binToString(header: string): string {
    let final = "";
    for (let i = 0; i < header.length; i += 8) {
      if (header.substring(i, i + 8).includes("1")) {
        const char = parseInt(header.substring(i, i + 8), 2);
        final += (String.fromCharCode(char));
      }
    }
    return final;
  }

  protected headerToBin(header: any): string {
    let bin = this.stringToBin(JSON.stringify(header));
    return bin.padStart(this.DEFAULT_HEADER_SIZE_IN_BITS, "0");
  }

  protected async injectFIleIntoImage() {
    const ctx = this.canvas.nativeElement.getContext("2d");
    const imgData = ctx?.getImageData(0, 0, this.canvasW, this.canvasH) as ImageData;

    const data = imgData.data;
    const newImg = ctx?.createImageData(this.canvasW, this.canvasH);
    if (newImg?.data.length !== imgData?.data.length) throw "Something went wrong, and we couldn't inject the file...";

    let bin = this.fileToBin(this.fileContents);
    const binBlockSize = this.bitsPerChannel * this.TOTAL_COLOR_CHANNELS;

    const header = this.headerToBin(this.fileMetadata);
    if(this.passwordForm.valid) {
      bin = await this.encryptBin(header) + await this.encryptBin(bin);
    } else {
      bin = header + bin;
    }

    const headerOffset = this.RESERVED_PIXELS_BEFORE_HEADER*this.CHANNELS_PER_PIXEL;
    const bpc = this.bitsPerChannel.toString(2).padStart(headerOffset, '0');
    for(let i = 0; i < headerOffset; i++) {
      if(i%3===0) {
        newImg.data[i] = parseInt(bpc.charAt(i).padStart(8, "1"), 2);
      } else {
        newImg.data[i] = parseInt(bpc.charAt(i), 2);
      }
    }

    const oldBitsPerChannel = this.bitsPerChannel;
    let binBlockCounter = 0;
    for (let channelIndex = headerOffset; channelIndex < data.length; channelIndex += 4) {
      let binData = "";
      if (bin.length > binBlockCounter) {
        binData = bin.substring(binBlockCounter, binBlockCounter + binBlockSize).padEnd(binBlockSize, "0");
        binBlockCounter += binBlockSize;
      } else {
        this.bitsPerChannel = 0;
      }
      newImg.data[channelIndex + 0] = parseInt(data[channelIndex + 0].toString(2).padStart(8, '0').substring(0, 8 - this.bitsPerChannel) + binData.substring(0, this.bitsPerChannel), 2);
      newImg.data[channelIndex + 1] = parseInt(data[channelIndex + 1].toString(2).padStart(8, '0').substring(0, 8 - this.bitsPerChannel) + binData.substring(this.bitsPerChannel, this.bitsPerChannel * 2), 2);
      newImg.data[channelIndex + 2] = parseInt(data[channelIndex + 2].toString(2).padStart(8, '0').substring(0, 8 - this.bitsPerChannel) + binData.substring(this.bitsPerChannel * 2, this.bitsPerChannel * 3), 2);
      newImg.data[channelIndex + 3] = 255;
    }
    ctx?.putImageData(newImg, 0, 0);
    this.bitsPerChannel = oldBitsPerChannel;

    alert("File injected successfully!");
  }

  protected async encryptBin(bin: string): Promise<string> {
    const aux = new CryptoUtils();
    const pass = this.passwordForm.get("password");
    if(!pass) return bin;
    return await aux.encode(bin, pass.value);
  }

  protected handlePaste(fieldType: "img"|"file", event: ClipboardEvent) {
    if(!event || !event.clipboardData) return;
    if(fieldType === "img") {
      this.imgInput.nativeElement.files = event.clipboardData.files;
      this.updateImgLink();
    } else {
      this.fileInput.nativeElement.files = event.clipboardData.files;
      this.handleFile();
    }
  }

  protected copyCurrentCanvasToClipboard() {
    this.canvas.nativeElement.toBlob(
      (blob => {
        if(!blob) return;
        const img = new ClipboardItem({"image/png": blob});
        navigator.clipboard.write([img]);
      }), "image/png", 1
    )
  }

}
