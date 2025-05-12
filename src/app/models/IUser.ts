import { IUserCredential } from "./IUserCredential";

export interface IUser {
    id: string; // Brukerens id (brukernavn)    
    credentials: IUserCredential[]; // Liste over brukerens lagrede kredentialer    
    lastChallenge?:string; // Siste challenge som ble sendt til serveren
}