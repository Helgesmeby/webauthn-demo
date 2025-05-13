'use server'
import { decode } from 'cbor2'
import { IUser } from '../models/IUser';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { saveUser, getUser, getUserByCredentialId, updateUserCredentialSignCount, getAllUsers, getDatabaseLength, getCredentialIdForUser } from '../../db/userDb'


/**
 * @param base64 - Base64-strengen som skal konverteres til ArrayBuffer
 * @returns  {ArrayBuffer} - Den konverterte ArrayBufferen
 * @description Denne funksjonen konverterer en Base64 Url-streng til en ArrayBuffer.
 */
function base64ToArrayBuffer(base64Url: string): ArrayBuffer {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binaryString = atob(base64 + padding);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/** 
 * @param buffer - ArrayBuffer som skal konverteres til Base64Url
 * @returns {string} - Den konverterte Base64-strengen 
 * @description Denne funksjonen konverterer en ArrayBuffer til en Base64Url-streng.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
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
 * @returns {string} - En tilfeldig generert challenge
 * @description Denne funksjonen genererer en tilfeldig challenge som brukes i autentiseringsprosessen.
 */
export const getChallengeFromServer = async (username: string) => {
    let challenge = Math.random().toString(36).substring(2, 10);
    console.log("Hentet challenge fra server: ", challenge);

    // Lagre challenge i brukerens data hvis brukeren ligger i databasen
    const user = getUserByCredentialId(username);
    if (user) {
        user.lastChallenge = challenge;
    }

    return challenge;
}




/**
 * @param credentialId - ID-en til autentiseringsmetoden
 * @param clientDataJson - Klientdata i JSON-format
 * @param authenticatorData - Autentiseringsdata i Base64-format
 * @param signature - Signaturen fra autentiseringsmetoden
 * @param userHandle - Håndtaket til brukeren
 * @returns {IUser | null} - Brukeren som har den angitte credentialId-en, eller null hvis ingen bruker finnes
 * @description Denne funksjonen logger inn en bruker ved å validere autentiseringsdataene og returnere brukeren.
 */
export const loginUserServerside = async (username: string, credentialId: string, clientDataJson: string, authenticatorData: string, signature: string, userHandle: string, origin: string) => {

    console.log("Credential id raw:", credentialId);

    console.log("Antall brukere i basen: ", getDatabaseLength());
    console.log("Login forsøk med credentialId: ", credentialId);

    // Dekode clientDataJson fra Base64 til UTF-8 streng og parse som JSON
    const clientDataBuffer = Buffer.from(clientDataJson, 'base64').toString('utf-8');
    const decodedClientData = JSON.parse(clientDataBuffer) as any;
    console.log("Dekodet clientData (JSON): ", decodedClientData);

    // Dekode authenticatorData fra Base64 til Buffer (for binær data)
    const authenticatorDataBuffer = Buffer.from(authenticatorData, 'base64');
    console.log("Dekodet authenticatorData (Buffer): ", authenticatorDataBuffer);

    // Dekode signature fra Base64 til Buffer (for binær data)
    const signatureBuffer = Buffer.from(signature, 'base64');
    console.log("Dekodet signatur (Buffer): ", signatureBuffer);

    // Dekode userHandle fra Base64 til Buffer (kan være null)
    const userHandleBuffer = userHandle ? Buffer.from(userHandle, 'base64') : undefined;
    console.log("Dekodet userHandle (Buffer): ", userHandleBuffer);

    const user = await getUserByCredentialId(credentialId); // Bruk await her siden det er en async funksjon
    if (!user) {
        console.log("Fant ingen bruker med credentialId: ", credentialId);
        return null;
    }

    console.log("Fant bruker med credentialId: ", credentialId);
    console.log("Bruker: ", user);

    let userCredential = getCredentialIdForUser(username, credentialId);
    if (!userCredential) {
        console.log("Fant ingen bruker med credentialId: ", credentialId);
        return null;
    }

    // Hent den lagrede offentlige nøkkelen fra brukerobjektet
    const publicKey = userCredential.publicKey; // Antar at `user`-objektet har en `publicKey`-egenskap (Base64-enkodet COSE)

    // Hent den lagrede signeringenstelleren fra brukerobjektet
    const counter = 0; // Antar at `user`-objektet har en `signCount`-egenskap

    // Hent den lagrede challenge fra brukerobjektet (som ble generert ved innloggingsstart)
    const challenge = user.lastChallenge; // Antar at `user`-objektet har en `lastChallenge`-egenskap

    const verificationOptions = {
        credentialPublicKey: Buffer.from(publicKey, 'base64'), // Konverter lagret Base64 public key til Buffer for @simplewebauthn/server
        challenge: challenge, // Bruk den lagrede challengen
        clientDataJSON: clientDataJson, // Send den rå Base64-enkodede strengen av clientDataJSON
        authenticatorData: authenticatorDataBuffer, // Som Buffer
        signature: signatureBuffer, // Som Buffer
        origin: origin, // Bruk den hentede opprinnelsen
        counter: counter, // Bruk den lagrede telleren
        userHandle: userHandleBuffer, // Som Buffer (kan være undefined)
    } as any;


    const verificationResult = await verifyAuthenticationResponse(verificationOptions);
    console.log("Verifikasjonsresultat: ", verificationResult);
}

/**
 * @param username - Brukernavnet til den nye brukeren
 * @param challenge - Utfordringen som ble sendt fra serveren
 * @param attestationStringBase64 - Attestasjonsdata i Base64-format
 * @returns {IUser} - Den registrerte brukeren
 * @description Denne funksjonen registrerer en ny bruker ved å validere attestasjonsdataene og lagre dem i databasen.
 */
export const registerUserServerside = async (username: string, challenge: string, attestationStringBase64: string) => {
    console.log("Fikk valideringsdata fra server: ", challenge);
    const attestationBuffer = base64ToArrayBuffer(attestationStringBase64);
    const attestationBufferUint8Array = new Uint8Array(attestationBuffer);

    const decodedAttestation = decode(attestationBufferUint8Array) as any;
    console.log("Dekodet attestasjonsobjekt: ", decodedAttestation);

    const authData = parseAuthenticatorData(decodedAttestation.authData);
    console.log("Parsed Authenticator Data: ", authData);

    // Valider attestasjonsdata (authData) her, denne øvelsen overlates til den interesserte leser :) 

    // Lagre bruker i databasen, vi lagrer credentialId og publicKey i base64-format
    // Hent ut credential id først, for å forhindre duplikater 
    console.log("CredentialId: ", authData.attestedCredentialData.credentialId);
    const credentialIdBase64 = arrayBufferToBase64(authData.attestedCredentialData.credentialId);
    console.log("CredentialId (base64): ", credentialIdBase64);
    const existingUser = getUserByCredentialId(credentialIdBase64);
    if (existingUser) {
        console.log("Bruker med credentialId finnes allerede: ", existingUser);
        return existingUser;
    }

    // Hent ut public key fra attestasjonsdataene, konverter til Uint8Array
    const publicKeyUint8Array  = new Uint8Array(authData.attestedCredentialData.credentialPublicKey);
const publicKeyArrayBuffer = publicKeyUint8Array.buffer; // Hent ArrayBuffer-en

    // Opprett ny bruker 
    let user = {
        id: username,
        credentials: [
            {
                username: username, // Brukernavn
                credentialId: credentialIdBase64, // ID-en til autentiseringsmetoden
                publicKey: arrayBufferToBase64(publicKeyArrayBuffer), // Den lagrede autentiseringsmetoden (base64)
            }]
    } as IUser;

    console.log("Opprettet ny bruker: ", user);
    saveUser(user); // Legg til bruker i databasen
    console.log("Bruker lagt til i databasen: ");
    return user;

}

/**
 * @returns {IUser[]} - Listen over alle registrerte brukere
 * @description Denne funksjonen returnerer listen over alle registrerte brukere i databasen.
 */
export const getUsers = async () => {
    return getAllUsers();
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
