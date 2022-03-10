import {IUser} from "@models/user_model";
import {dbPool} from "@daos/database";
import {OkPacket, RowDataPacket} from "mysql2";
import {hash} from "@node-rs/argon2";
import {emailRegex, sha512Regex, usernameRegex} from "@shared/regex";
import {UserCreationStatus} from "@shared/enums";
import crypto from 'crypto';
import sendEmail from "@shared/mailer";
import {EmailVerificationRow} from "@models/email_verification_model";
import {SharesRow} from "@models/shares_model";

// The type for all rows.
type RowOrRows = RowDataPacket[] | RowDataPacket[][];

/**
 * Checks whether a MYSQL query returns a row or rows.
 */
function isRowOrRows(toBeDetermined: any): toBeDetermined is RowOrRows {
    return (toBeDetermined as RowOrRows).length !== undefined;
}

// Checks whether a MYSQL query returns an OkPacket.
function isOkPacket(toBeDetermined: any): toBeDetermined is OkPacket {
    return (toBeDetermined as OkPacket).affectedRows !== undefined;
}

/**
 * Get one user.
 * @param username The username of the user.
 * @returns
 */
async function getUserByUsername(username: string): Promise<IUser | null> {
    // Set the username to lowercase.
    username = username.toLowerCase();

    const [data] = await dbPool.query(`SELECT * FROM users WHERE username = ?`, [username]);

    // If we received data, and there is one user with this name.
    if (isRowOrRows(data) && data.length === 1) {
        // Return as a user object
        return data[0] as IUser;
    }

    return null;
}

async function getUserByUserId(userId: number): Promise<IUser | null> {
    const [data] = await dbPool.query(`SELECT * FROM users WHERE user_id = ?`, [userId]);

    // If we received data, and there is one user with this name.
    if (isRowOrRows(data) && data.length === 1) {
        // Return as a user object
        return data[0] as IUser;
    }

    return null;
}

/**
 * Generate a random string for email verification.
 */
function generateVerificationCode(): string {
    return crypto.randomBytes(32).toString('base64url');
}

async function saveVerificationCode(user_id: number, code: string, email: string): Promise<boolean> {
    const [insertResult] = await dbPool.query(`INSERT INTO email_verification (user_id, verification_code, email) VALUES (?, ?, ?)`, [user_id, code, email]);

    return isOkPacket(insertResult) && insertResult.affectedRows === 1;
}

async function getVerificationCodeForUser(user_id: number, email: string): Promise<string | null> {
    const code = generateVerificationCode();

    const success = await saveVerificationCode(user_id, code, email);

    if (success) return code;

    return null;
}

// Check if a username is already taken.
async function usernameIsTaken(username: string): Promise<boolean> {
    const user = await getUserByUsername(username.toLowerCase());

    return user !== null;
}

// Check if the email is already taken.
async function emailIsTaken(email: string): Promise<boolean> {
    // Check if the email is already taken. (Case insensitive)
    const [data] = await dbPool.query(`SELECT * FROM users WHERE LOWER(email) = ?`, [email.toLowerCase()]);

    return isRowOrRows(data) && data.length === 1;
}

// Takes an email and code, checks it against the database with mysql2 and returns true if the email is now verified.
async function tryVerifyEmail(email: string, code: string): Promise<[true, number]|[false]> {
    const [data] = await dbPool.query(`SELECT * FROM email_verification WHERE email = ? AND verification_code = ?`, [email, code]);

    // If we received data, and there is one email verification line.
    if (isRowOrRows(data) && data.length === 1) {
        // We can now verify the user's email.

        const emailVerificationRow = data[0] as EmailVerificationRow;

        // Set the user's email to verified. (Set their email too so they can't change it and then verify a different email.)
        const [updateResult] = await dbPool.query(`UPDATE users SET email_verified = 1, email = ? WHERE user_id = ?`, [emailVerificationRow.email ,emailVerificationRow.user_id]);

        if (isOkPacket(updateResult) && updateResult.affectedRows === 1) {
            // Invalidate all of this user's email verification codes.
            await dbPool.query(`DELETE FROM email_verification WHERE user_id = ?`, [emailVerificationRow.user_id]);

            return [true, emailVerificationRow.user_id];
        }
    }

    return [false];
}

function isNumber(num: any): num is number {
    return typeof num === 'number';
}

async function getUserPersonalShares(user: IUser | number | null):Promise<[number, string[]]|null> {
    let shares = [];

    if (isNumber(user)) user = await getUserByUserId(user);

    if (user === null) return null;

    const [data] = await dbPool.query(`SELECT * FROM shamir_shares WHERE applies_to = ? and encrypted_by = ?`, [user.user_id, user.user_id]);

    if (isRowOrRows(data)) {
        for (let i = 0; i < data.length; i++) {
            const share = data[i] as SharesRow;

            shares.push(share.share_value);
        }
    }

    return [user.share_count, shares];
}

async function sendVerificationEmail(user: IUser | null): Promise<boolean> {
    if (user === null) return false;

    const verificationCode = await getVerificationCodeForUser(user.user_id, user.email);

    if (verificationCode) {
        return await sendEmail("transactional", {
            header: "Verify your email",
            text: "Thank you for joining WhoAmI. Please verify your email to start securing your data by clicking the link below.",
            c2a_link: (process.env.NODE_ENV !== "production" ? process.env.DEVELOPMENT_FRONTEND_URL : process.env.PRODUCTION_FRONTEND_URL) + "/auth/verify/email/callback/" + verificationCode + "/" + Buffer.from(user.email).toString('base64url'),
            c2a_button: "Verify your email",
        }, "Please verify your email for WhoAmI", `"${user.username}" ${user.email}`, '"WhoAmI" <noreply@d.elive.red>');
    }

    return false;
}

/**
 * Update a user's email
 * @param username
 * @param email
 */
async function updateEmail(username: string, email: string): Promise<boolean> {
    const user = await getUserByUsername(username);
    if (user === null) return false;

    if (user.email === email) return true; // don't update if the email is the same

    if (await emailIsTaken(email) && user.email !== email) return false; // don't update if the email is already taken

    const [updateResult] = await dbPool.query(`UPDATE users SET email = ?, email_verified = ? WHERE user_id = ?`, [email, false, user.user_id]);

    return isOkPacket(updateResult) && updateResult.affectedRows === 1;
}

/**
 * Create one user
 * @returns True: If the user was created successfully.
 * @returns False: If the user couldn't be created.
 * @returns Null: If the email or username is already in use.
 * @param username The username of the user.
 * @param password The user's hash of their password (which acts like their password)
 * @param email The user's email.
 * @param encryptedShares[] The user's encrypted shares.
 */
async function createUserByUsername(username: string, password: string, email: string, encryptedShares: string[]):Promise<UserCreationStatus> {
    // Lowercase all login details, to reduce user errors.
    username = username.toLowerCase();

    // Validate the username.
    if (username.match(usernameRegex) === null) {
        return UserCreationStatus.InvalidUsername;
    }

    // Validate the email.
    if (email.match(emailRegex) === null) {
        return UserCreationStatus.InvalidEmail;
    }

    // Check the password is hashed with sha512.
    if (password.match(sha512Regex) === null) {
        return UserCreationStatus.InvalidPasswordHashing;
    }

    // Validate if the username is already taken.
    if (await usernameIsTaken(username)) {
        return UserCreationStatus.UsernameTaken;
    }

    // Validate if the email is already taken.
    if (await emailIsTaken(email)) {
        return UserCreationStatus.EmailTaken;
    }


    try {
        // Hash the already hashed password (hashed on the client side, so we never know the password).
        // We call it "password" because it acts like the password - when sent to us, we return the database.
        let hashedPassword = await hash(password);

        // Insert the user into the database.
        const [userResult] = await dbPool.query(`INSERT INTO users (username, password, email, share_count)
                                                 VALUES (?, ?, ?,
                                                         ?)`, [username, hashedPassword, email, 2]);


        // If we received an OK Response, and one row was affected. (The user was created)
        if (isOkPacket(userResult) && userResult.affectedRows === 1) {
            // Map shares into database format (userId, share, userId)
            const sharesToInsert = encryptedShares.map((share) => {
                return [
                    userResult.insertId,
                    share,
                    userResult.insertId
                ];
            });

            // Now we need to add the shamir share to the database. (This is what encrypts the data of the user)
            const [shamirResult] = await dbPool.query(`INSERT INTO shamir_shares (encrypted_by, share_value, applies_to) VALUES ?`, [sharesToInsert]);

            if (isOkPacket(shamirResult) && shamirResult.affectedRows === 2) {
                return UserCreationStatus.Success;
            } else {
                // If the shamir share was not added, we need to delete the user.
                await dbPool.query(`DELETE
                                    FROM users
                                    WHERE user_id = ?`, [userResult.insertId]);
                return UserCreationStatus.Failed;
            }
        }
    } catch (e){
        console.log(e);
        return UserCreationStatus.Failed;
    }

    // If an error occurred, their email is probably already in use.
    return UserCreationStatus.Failed;
}

export {
    getUserByUsername,
    createUserByUsername,
    usernameIsTaken,
    emailIsTaken,
    generateVerificationCode,
    getVerificationCodeForUser,
    updateEmail,
    sendVerificationEmail,
    getUserByUserId,
    tryVerifyEmail,
    getUserPersonalShares
};