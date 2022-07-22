import { User } from "../../types.js";
import { createAccessToken, createFingerprintToken, createRefreshToken, getAccountFromDatabaseData } from "../../utils/auth.js";
import { compare } from "../../utils/crypto.js";
import { LuciaError } from "../../utils/error.js";
import {
    AccessToken,
    EncryptedRefreshToken,
    FingerprintToken,
    RefreshToken,
} from "../../utils/token.js";
import { Context } from "../index.js";

export type authenticateUser = (
    authId: string,
    identifier: string,
    password?: string
) => Promise<{
    user: User;
    access_token: AccessToken;
    refresh_token: RefreshToken;
    encrypted_refresh_token: EncryptedRefreshToken;
    fingerprint_token: FingerprintToken;
    cookies: string[];
}>;

export const authenticateUserFunction = (context: Context) => {
    const authenticateUser: authenticateUser = async (
        authId,
        identifier,
        password
    ) => {
        const identifierToken = `${authId}:${identifier}`;
        const databaseData = await context.adapter.getUserFromIdentifierToken(
            identifierToken
        );
        if (!databaseData)
            throw new LuciaError("AUTH_INVALID_IDENTIFIER_TOKEN");
        const account = getAccountFromDatabaseData(databaseData);
        if (account.hashed_password) {
            try {
                await compare(password || "", account.hashed_password);
            } catch {
                throw new LuciaError("AUTH_INVALID_PASSWORD");
            }
        }
        const userId = account.user.user_id;
        const fingerprintToken = createFingerprintToken(context);
        const refreshToken = await createRefreshToken(
            account.user.user_id,
            fingerprintToken.value,
            context
        );
        await context.adapter.saveRefreshToken(refreshToken.value, userId);
        const encryptedRefreshToken = refreshToken.encrypt();
        const accessToken = await createAccessToken(
            account.user,
            fingerprintToken.value,
            context
        );
        const accessTokenCookie = accessToken.createCookie();
        const encryptedRefreshTokenCookie =
            encryptedRefreshToken.createCookie();
        const fingerprintTokenCookie = fingerprintToken.createCookie();
        return {
            user: account.user,
            access_token: accessToken,
            refresh_token: refreshToken,
            fingerprint_token: fingerprintToken,
            encrypted_refresh_token: encryptedRefreshToken,
            cookies: [
                accessTokenCookie,
                encryptedRefreshTokenCookie,
                fingerprintTokenCookie,
            ],
        };
    };
    return authenticateUser;
};