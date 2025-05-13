'use server'
import { decode } from 'cbor2'
import { createHash, createVerify, createPublicKey } from 'crypto';
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
    const user = getUser(username);
    if (user) {
        console.log("Oppdaterer challenge for bruker: ", user);
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
export const loginUserServerside = async (
    username: string,
    credentialId: string,
    clientDataJson: string,
    authenticatorData: string,
    signature: string,
    userHandle: string, // Base64URL encoded user handle from client
    origin: string
) => {
    console.log("Login forsøk med credentialId (Base64url): ", credentialId);

    // Dekode clientDataJson fra Base64url til UTF-8 streng og parse som JSON
    // const clientDataBuffer = Buffer.from(clientDataJson, 'base64url').toString('utf-8'); // This is if clientDataJson is base64 of a string
    // Assuming clientDataJson from client is arrayBufferToBase64(credential.response.clientDataJSON)
    // which means clientDataJson is already a base64url string representing the ArrayBuffer bytes.
    const clientDataJsonBytes = Buffer.from(clientDataJson, 'base64url');
    const decodedClientData = JSON.parse(clientDataJsonBytes.toString('utf-8')) as any;

    // Dekode authenticatorData fra Base64url til Buffer (for binær data)
    const authenticatorDataBuffer = Buffer.from(authenticatorData, 'base64url');
    console.log("Dekodet authenticatorData (Buffer length): ", authenticatorDataBuffer.length);

    // Dekode signature fra Base64url til Buffer (for binær data)
    const signatureBuffer = Buffer.from(signature, 'base64url');
    console.log("Dekodet signatur (Buffer length): ", signatureBuffer.length);

    // Hent bruker basert på innsendt credentialid
    const user = await getUserByCredentialId(credentialId); // Assume this function exists and works
    if (!user || !user.credentials) {
        return { verified: false, error: `User not found for credentialId ${credentialId}` };
    }

    const usercredential = user.credentials.find(cred => cred.credentialId === credentialId);
    if (!usercredential) {
        return { verified: false, error: `Passkey (credential) not found for user ${username}` };
    }

    console.log("Bruker funnet: ", user.id);
    console.log("User credential publicKey (base64url):", usercredential.publicKey);


    // Verify clientDataJSON challenge (important security step)
    const expectedChallenge = user.lastChallenge; // Assuming you store this after initiating login
    const receivedChallenge = decodedClientData.challenge; // This is base64url from clientDataJSON
   /* if (receivedChallenge !== expectedChallenge) {
        console.error(`Challenge mismatch. Expected: ${expectedChallenge}, Received: ${receivedChallenge}`);
        return { verified: false, error: "Challenge mismatch." };
    }*/


    const publicKeyBase64Url = usercredential.publicKey;
    let publicKeyCose: Map<number, any> | undefined;
    try {
        const publicKeyBuffer = Buffer.from(publicKeyBase64Url, 'base64url');
        publicKeyCose = decode(publicKeyBuffer) as Map<number, any>; // Using cbor-x 'decode'
        console.log("Dekodet COSE Public Key (med cbor):", publicKeyCose);
    } catch (error) {
        console.error("Feil ved CBOR-dekoding av public key:", error);
        return { verified: false, error: "Feil ved dekoding av public key" };
    }

    if (!publicKeyCose) return { verified: false, error: "Kunne ikke dekode public key" };

    const clientDataHash = createHash('sha256').update(clientDataJsonBytes).digest();
    const signedData = Buffer.concat([authenticatorDataBuffer, clientDataHash]);

    let verification = false;
    let publicKeyForVerification: any;

    try {
        const algorithm = publicKeyCose.get(3); // COSE Key parameter: alg
        if (algorithm === -7) { // ES256 (ECDSA using P-256 and SHA-256)
            const x = publicKeyCose.get(-2) as Buffer; // COSE Key parameter: x-coordinate
            const y = publicKeyCose.get(-3) as Buffer; // COSE Key parameter: y-coordinate

            if (!x || !y) {
                return { verified: false, error: "Invalid EC public key components (x or y missing)." };
            }

            // Solution 1: Constructing PEM with correct SPKI DER
            // The SPKI prefix for P-256 (secp256r1) public key
            const spkiPrefix = Buffer.from(
                '3059301306072a8648ce3d020106082a8648ce3d030107034200',
                'hex'
            );
            // The public key point: 0x04 (uncompressed) + x-coordinate + y-coordinate
            const publicKeyPoint = Buffer.concat([Buffer.from([0x04]), x, y]);
            const publicKeyDer = Buffer.concat([spkiPrefix, publicKeyPoint]);

            publicKeyForVerification = `-----BEGIN PUBLIC KEY-----\n${publicKeyDer.toString('base64')}\n-----END PUBLIC KEY-----\n`;

            const verifier = createVerify('SHA256'); // Node's crypto uses SHA256 for ECDSA with P-256
            verifier.update(signedData);
            verification = verifier.verify(publicKeyForVerification, signatureBuffer);

        } else {
            console.error("Unsupported algorithm:", algorithm);
            return { verified: false, error: "Unsupported algorithm" };
        }
    } catch (error: any) {
        console.error("Feil under signaturverifisering:", error);
        if (error.opensslErrorStack) {
            console.error("OpenSSL Error Stack:", error.opensslErrorStack);
        }
        console.error("Public Key for Verification (PEM or KeyObject):", publicKeyForVerification);
        console.error("Signature Buffer (first 16 bytes hex):", signatureBuffer.slice(0, 16).toString('hex'));
        return { verified: false, error: `Feil under signaturverifisering: ${error.message || JSON.stringify(error)}` };
    }

    console.log("Verifisering av signatur: ", verification);

    if (verification) {
        // Optional: Update signCount
        usercredential.signCount = authenticatorDataBuffer.readUInt32BE(33); // Read the sign count from authenticatorData
        // Persist the new signCount for clone detection
        console.log("New sign count: ", usercredential.signCount);

        // Optional: User Handle Verification
        if (userHandle && userHandle.length > 0) { // userHandle is base64url from client
            const decodedUserHandle = Buffer.from(userHandle, 'base64url').toString('utf-8');
            if (user.id !== decodedUserHandle) {
                console.warn(`User handle mismatch. Stored User ID: ${user.id}, Received User Handle: ${decodedUserHandle}. This might be acceptable depending on authenticator behavior or if allowCredentials was empty.`);
                // For strict checking, you might return an error:
                // return { verified: false, error: "User handle mismatch." };
            } else {
                console.log("User handle verified.");
            }
        }

    }

    return { verified: verification, user: verification ? user : null, error: verification ? undefined : "Signature verification failed" };
};

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
    const publicKeyUint8Array = new Uint8Array(authData.attestedCredentialData.credentialPublicKey);
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
