import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';

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

  readonly DEFAULT_BITES_PER_CHANNEL = 2;
  readonly DEFAULT_HEADER_SIZE_IN_BITS = 320;
  readonly TOTAL_COLOR_CHANNELS = 3;

  protected linkForm: FormGroup;
  protected fileForm: FormGroup;
  protected bitesPerChannel = this.DEFAULT_BITES_PER_CHANNEL;
  protected imgAvailableBytes = 0;

  protected fileMetadata = {
    type: "",
    size: 0
  }

  protected isImgLoaded = false;
  protected isFileLoaded = false;

  protected fileContents: ArrayBuffer;

  protected canvasW = 0;
  protected canvasH = 0;

  constructor(
    private fb: FormBuilder
  ) {
  }

  ngOnInit() {
    // does not work, moving on....
    this.linkForm = this.fb.group({link: [null, Validators.required]});
    this.fileForm = this.fb.group({file: [null, Validators.required]});
  }

  protected updateImgLink() {
    this.isImgLoaded = false;
    const files = this.imgInput.nativeElement.files;
    if(!files || !files[0]) throw "No file has been selected!";
    const file = files[0];

    const reader = new FileReader();
    reader.onload = (event) => {

      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = async () => {
        const bitmap = await createImageBitmap(img);
        this.canvasH = img.height;
        this.canvasW = img.width;
        this.imgAvailableBytes = (this.canvasH*this.canvasW*this.TOTAL_COLOR_CHANNELS*this.bitesPerChannel)/8;
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
    this.bitesPerChannel = sliderValue;
    this.imgAvailableBytes = (this.canvasH*this.canvasW*this.TOTAL_COLOR_CHANNELS*this.bitesPerChannel)/8;
  }

  protected handleFile() {
    const files = this.fileInput.nativeElement.files;
    if(!files || !files[0]) throw "No file has been selected!";
    const file = files[0];

    const reader = new FileReader();
    reader.onload = (event) => {
      this.isFileLoaded = true;
      this.fileMetadata = {
        size: file.size,
        type: file.type
      }
      console.log(this.fileMetadata);
      
      this.fileContents = event?.target?.result as ArrayBuffer;
    }
    reader.readAsArrayBuffer(file);
  }

  protected parseSize(size: number): string {
    if(size > 1000000000) {
      return `${Math.round((size/1000000000)*10)/10} GB`;
    }
    if(size > 1000000) {
      return `${Math.round((size/1000000)*10)/10} MB`;
    }
    if(size > 1000) {
      return `${Math.round((size/1000)*10)/10} KB`;
    }
    return `${size} bytes`;
  }

  protected fileToBin(file: ArrayBuffer): string {
      const dataView = new DataView(file);
      let binaryString = "";

      for (let i = 0; i < file.byteLength; i++) {
        // Get the byte (8 bits) at the current position
        const byte = dataView.getUint8(i);

        // Convert the byte to its 8-bit binary string representation
        // (e.g., 255 becomes "11111111", 10 becomes "00001010")
        binaryString += byte.toString(2).padStart(8, '0');
      }
      return binaryString;
  }

  protected binToFile(binaryString: string, filetype: string, filename = 'output') {
    if(filetype === "") filetype = 'application/octet-stream';
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

  // TODO: inject and auto detect bits per channel used
  protected extractDataFromImage(): string {
    const ctx = this.canvas.nativeElement.getContext("2d");
    let extractedData = "";

    const imgData = ctx?.getImageData(0, 0, this.canvasW, this.canvasH) as ImageData;
    const data = imgData.data;
    for(let i = 0; i < data.length; i += 4) {
      // red channel
      extractedData += data[i].toString(2).padStart(8, '0').substring(8-this.bitesPerChannel);
      // green channel
      extractedData += data[i+1].toString(2).padStart(8, '0').substring(8-this.bitesPerChannel);
      // blue channel
      extractedData += data[i+2].toString(2).padStart(8, '0').substring(8-this.bitesPerChannel);
      // const alpha = data[i + 3];
      // no alpha https://stackoverflow.com/questions/23497925/how-can-i-stop-the-alpha-premultiplication-with-canvas-imagedata/23501676#23501676
    }
    let header;
    try {
      header = JSON.parse(this.binToHeader(extractedData.substring(0, this.DEFAULT_HEADER_SIZE_IN_BITS)));
    } catch (e) {
      alert("Corrupted image, or the number of bits per channel is not the same as when the image was generated");
      throw "Corrupted image, or the number of bits per channel is not the same as when the image was generated";
    }
    this.binToFile(extractedData.substring(this.DEFAULT_HEADER_SIZE_IN_BITS, this.DEFAULT_HEADER_SIZE_IN_BITS+(header.size*8)), header.type);
    return extractedData;
  }

  protected headerToBin(header: any): string {
    const metadata = JSON.stringify(header);
    let bin = "";
    for(let char of metadata) {  
      bin+=(char.charCodeAt(0).toString(2).padStart(8, "0"));
    }
    return bin.padStart(this.DEFAULT_HEADER_SIZE_IN_BITS, "0");
  }

  protected binToHeader(header: string): string {
    let final = "";
    for(let i = 0; i< header.length; i+=8){
        if(header.substring(i, i+8).includes("1")){
          const char = parseInt(header.substring(i, i+8), 2);
          final+=(String.fromCharCode(char));
        }
    }
    return final;
  }

  protected injectFIleIntoImage() {
    const ctx = this.canvas.nativeElement.getContext("2d");
    const imgData = ctx?.getImageData(0, 0, this.canvasW, this.canvasH) as ImageData;

    const data = imgData.data;
    const newImg = ctx?.createImageData(this.canvasW, this.canvasH);
    if(newImg?.data.length !== imgData?.data.length) throw "Something went wrong, and we couldn't inject the file...";

    let bin = this.fileToBin(this.fileContents);
    const binBlockSize = this.bitesPerChannel*this.TOTAL_COLOR_CHANNELS;
    const defaultFiller = "".padStart(binBlockSize, "0");

    bin = this.headerToBin(this.fileMetadata)+bin;

    let binBlockCounter = 0;
    for(let channelIndex = 0; channelIndex < data.length; channelIndex+=4) {
      let binData = defaultFiller;
      if(bin.length > binBlockCounter) {
        binData = bin.substring(binBlockCounter, binBlockCounter+binBlockSize).padEnd(binBlockSize, "0");
        binBlockCounter += binBlockSize;
      } 
      newImg.data[channelIndex+0] = parseInt(data[channelIndex+0].toString(2).padStart(8, '0').substring(0, 8-this.bitesPerChannel) + binData.substring(0, this.bitesPerChannel), 2);
      newImg.data[channelIndex+1] = parseInt(data[channelIndex+1].toString(2).padStart(8, '0').substring(0, 8-this.bitesPerChannel) + binData.substring(this.bitesPerChannel, this.bitesPerChannel*2), 2);
      newImg.data[channelIndex+2] = parseInt(data[channelIndex+2].toString(2).padStart(8, '0').substring(0, 8-this.bitesPerChannel) + binData.substring(this.bitesPerChannel*2, this.bitesPerChannel*3), 2);
      newImg.data[channelIndex+3] = 255;
    }
    ctx?.putImageData(newImg, 0, 0);

    alert("File injected successfully!")
  }

}
