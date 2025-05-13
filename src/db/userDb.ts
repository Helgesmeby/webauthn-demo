import { IUser } from '@/app/models/IUser';
import { IUserCredential } from '../app/models/IUserCredential';

// Bruk en Map for å lagre brukere, med brukernavn som nøkkel
const userDatabase = new Map<string, IUser>();

export const saveUser = (user: IUser) => {
    userDatabase.set(user.id, user);
};

export const getUser = (username: string): IUser | undefined => {
    return userDatabase.get(username);
};

export const getUserByCredentialId = (credentialId: string): IUser | undefined => {
    for (const user of userDatabase.values()) {
        if (user.credentials && user.credentials.some(cred => cred.credentialId === credentialId)) {
            return user;
        }
    }
    return undefined;
};

export const getCredentialIdForUser = (username: string, credentialId: string): IUserCredential => {
    const user = userDatabase.get(username);
    if (user && user.credentials) {
        return user.credentials.filter(cred => cred.credentialId === credentialId)[0];
    }
    return {} as IUserCredential;
}

export const getDatabaseLength = () => {
    return userDatabase.size;
}

export const getAllUsers = () => {
    const users: IUser[] = [];
    userDatabase.forEach((user) => {
        users.push(user);
    });
    return users;
}


export const updateUserCredentialSignCount = (credentialId: string, newSignCount: number) => {
    for (const user of userDatabase.values()) {
        if (user.credentials) {
            const credential = user.credentials.find(cred => cred.credentialId === credentialId);
            if (credential) {
                credential.signCount = newSignCount;
                return true;
            }
        }
    }
    return false;
};
