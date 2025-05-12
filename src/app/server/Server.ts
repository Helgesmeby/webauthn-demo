'use server'
import { decode, diagnose, encode }from 'cbor2'
import * as cose from 'cose-js'
import { get } from 'http';
import { IUser } from '../models/IUser';

/**
 * @description Brukerdatabasen som lagrer alle registrerte brukere og deres autentiseringsmetoder.
 */
var userDatabase = new Array<IUser>();

/**
 * @param base64 - Base64-strengen som skal konverteres til ArrayBuffer
 * @returns  {ArrayBuffer} - Den konverterte ArrayBufferen
 * @description Denne funksjonen konverterer en Base64-streng til en ArrayBuffer.
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = Buffer.from(base64, 'base64').toString('binary');
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

/** 
 * @param buffer - ArrayBuffer som skal konverteres til Base64
 * @returns {string} - Den konverterte Base64-strengen 
 * @description Denne funksjonen konverterer en ArrayBuffer til en Base64-streng.
 */
function arrayBufferToBase64(buffer:any) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}


/** 
 * @returns {string} - En tilfeldig generert challenge
 * @description Denne funksjonen genererer en tilfeldig challenge som brukes i autentiseringsprosessen.
 */
export const getChallengeFromServer = async (username:string) => {
    let challenge = Math.random().toString(36).substring(2, 10);
    console.log("Hentet challenge fra server: ", challenge);
    
    // Lagre challenge i brukerens data
    const user = getUserWithCredentialId(username);
    if(user) {
        user.lastChallenge = challenge; 
    } 
    
    return challenge; 
}


/** 
 * @param credentialId - ID-en til autentiseringsmetoden
 * @returns {IUser | null} - Brukeren som har den angitte credentialId-en, eller null hvis ingen bruker finnes
 * @description Denne funksjonen søker etter en bruker i databasen basert på credentialId-en.
 */
const getUserWithCredentialId = (credentialId: string) => {
    for(let user of userDatabase) {
        if(user.credentials.filter( k => k.credentialId === credentialId).length > 0) {
            return user; 
        }
    }
    return null;
}


export const loginUserServerside = async (credentialId:string, clientDataJson:string, authenticatorData:string) => {
    const user = getUserWithCredentialId(credentialId);
    if(!user) {
        console.log("Fant ingen bruker med credentialId: ", credentialId);
        return null; 
    }

    console.log("Fant bruker med credentialId: ", credentialId);
    console.log("Bruker: ", user);



}

/**
 * @param username - Brukernavnet til den nye brukeren
 * @param challenge - Utfordringen som ble sendt fra serveren
 * @param attestationStringBase64 - Attestasjonsdata i Base64-format
 * @returns {IUser} - Den registrerte brukeren
 * @description Denne funksjonen registrerer en ny bruker ved å validere attestasjonsdataene og lagre dem i databasen.
 */
export const registerUserServerside = async (username: string, challenge: string, attestationStringBase64:string) => {
    console.log("Fikk valideringsdata fra server: ", challenge);
    const attestationBuffer = base64ToArrayBuffer(attestationStringBase64);
    const attestationBufferUint8Array = new Uint8Array(attestationBuffer);

    const decodedAttestation = decode(attestationBufferUint8Array) as any;
    console.log("Dekodet attestasjonsobjekt: ", decodedAttestation);

    const authData = parseAuthenticatorData(decodedAttestation.authData);
    console.log("Parsed Authenticator Data: ", authData);


    // Valider attestasjonsdata her, denne øvelsen overlates til den interesserte leser :) 

    // Hent ut credential id først, for å forhindre duplikater 
    const credentialId = arrayBufferToBase64(authData.attestedCredentialData.credentialId);

    const existingUser = getUserWithCredentialId(credentialId);
    if(existingUser) {
        console.log("Bruker med credentialId finnes allerede: ", existingUser);
        return existingUser; 
    }

    // Hent ut public key fra attestasjonsdataene, konverter til Uint8Array
    const publicKey = new Uint8Array(authData.attestedCredentialData.credentialPublicKey);

    // Opprett ny bruker 
    let user = {
        id: username, 
        credentials: [
            {
                username: username, // Brukernavn
                credentialId: credentialId, // ID-en til autentiseringsmetoden
                publicKey: arrayBufferToBase64(publicKey), // Den lagrede autentiseringsmetoden (base64)
            }]        
    } as IUser; 

    userDatabase.push(user); // Legg til bruker i databasen

    return user; 
    
}

/**
 * @returns {IUser[]} - Listen over alle registrerte brukere
 * @description Denne funksjonen returnerer listen over alle registrerte brukere i databasen.
 */
export const getUsers = async () => {
    return userDatabase; 
}


/**
 * @param authData - Authenticator data i form av en Uint8Array
 * @returns {any} - Parsed Authenticator Data
 * @description Denne funksjonen parser autentiseringsdataene og returnerer dem i et lesbart format.
 */
function parseAuthenticatorData(authData: Uint8Array): any {
  let offset = 0;

  const rpIdHash = authData.slice(offset, offset + 32);
  offset += 32;

  const flagsInt = authData[offset];
  offset += 1;
  const flags = {
    up: !!(flagsInt & 0x01),           // User Present
    uv: !!(flagsInt & 0x04),           // User Verified
    at: !!(flagsInt & 0x40),           // Attested Credential Data Included
    ed: !!(flagsInt & 0x80),           // Extension Data Included
  };

  const signCount = new DataView(authData.buffer, authData.byteOffset + offset, 4).getUint32(0, false);
  offset += 4;

  let attestedCredentialData: any = null;
  if (flags.at) {
    attestedCredentialData = {};
    attestedCredentialData.aaguid = authData.slice(offset, offset + 16);
    offset += 16;

    const credentialIdLength = new DataView(authData.buffer, authData.byteOffset + offset, 2).getUint16(0, false);
    offset += 2;

    attestedCredentialData.credentialId = authData.slice(offset, offset + credentialIdLength);
    offset += credentialIdLength;

    // Parsing av credentialPublicKey krever ytterligere COSE-dekoding
    attestedCredentialData.credentialPublicKey = authData.slice(offset);
    // Merk: For å få en leselig JSON av public key, må du dekode COSE-strukturen.
  }

  let extensionData: Uint8Array | null = null;
  if (flags.ed) {
    extensionData = authData.slice(offset);
    // Parsing av extensionData er spesifikt for de aktuelle utvidelsene.
  }

  return {
    rpIdHash: Array.from(rpIdHash), // Konverter til array for JSON
    flags: flags,
    signCount: signCount,
    attestedCredentialData: attestedCredentialData ? {
      aaguid: Array.from(attestedCredentialData.aaguid),
      credentialId: Array.from(attestedCredentialData.credentialId),
      credentialPublicKey: Array.from(attestedCredentialData.credentialPublicKey), // Rå COSE-data
    } : null,
    extensionData: extensionData ? Array.from(extensionData) : null,
  };
}
