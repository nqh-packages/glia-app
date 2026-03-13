declare module "qrcode" {
  function toDataURL(
    text: string,
    options?: { errorCorrectionLevel?: string; margin?: number; width?: number }
  ): Promise<string>;
}
