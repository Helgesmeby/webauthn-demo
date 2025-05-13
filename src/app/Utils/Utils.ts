'use client'

/** 
 * @description Konverterer ArrayBuffer til base64Url
 * @param buffer  - ArrayBuffer
 * @returns base64Url
 */
export function arrayBufferToBase64(buffer: any) {
   let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  }

  /**
   * 
   * @param base64 - base64
   * @description Konverterer base64 til ArrayBuffer
   * @returns base64Url
   */
  export function base64ToArrayBuffer(base64Url: string): ArrayBuffer {
   const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binaryString = atob(base64 + padding);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
  }
