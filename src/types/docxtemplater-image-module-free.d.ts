/**
 * Tipe minimal untuk `docxtemplater-image-module-free` (paket tidak membawa
 * deklarasi). Yang dipakai hanya konstruktor + tiga opsi di bawah.
 */
declare module 'docxtemplater-image-module-free' {
  interface ImageModuleOptions {
    centered?: boolean;
    getImage: (value: string, tagName?: string) => Buffer;
    getSize: (buffer: Buffer, value?: string, tagName?: string) => [number, number];
  }

  class ImageModule {
    constructor(options: ImageModuleOptions);
  }

  export = ImageModule;
}
